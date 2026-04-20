import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3737;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Paths ────────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '..');
const REVIEWS_PATH = path.join(__dirname, 'reviews.json');

const MODELS = {
  gemini: {
    key: 'gemini',
    label: 'Gemini 2.5 Flash',
    provider: 'Google',
    file: path.join(DATA_DIR, 'gemini-full_labels_485.json'),
    color: '#4285F4',
    icon: '🌀'
  },
  gpt: {
    key: 'gpt',
    label: 'GPT-5.4',
    provider: 'OpenAI',
    file: path.join(DATA_DIR, 'GPT5.4_full_labels_485.json'),
    color: '#10a37f',
    icon: '⚡'
  }
};

// ─── Label config ─────────────────────────────────────────────────────────────
// How many samples per label to show in a review session
const SAMPLE_CONFIG = {
  A: 2,  // pdr - full alignment
  B: 2,  // pd  - property + domain
  C: 2,  // pr  - property + range
  D: 1,  // p   - property only
  E: 1,  // n   - no alignment
};

const LABEL_META = {
  A: { code: 'pdr', display: 'p(D,R)', desc: 'Full alignment — Property, Domain & Range match', color: '#22c55e', bg: '#dcfce7' },
  B: { code: 'pd',  display: 'p(D,?)', desc: 'Property + Domain align', color: '#3b82f6', bg: '#dbeafe' },
  C: { code: 'pr',  display: 'p(?,R)', desc: 'Property + Range align', color: '#a855f7', bg: '#f3e8ff' },
  D: { code: 'p',   display: 'p(?,?)', desc: 'Property expressed, Domain/Range do not align', color: '#f59e0b', bg: '#fef3c7' },
  E: { code: 'n',   display: 'No alignment', desc: 'Irrelevant sentence', color: '#ef4444', bg: '#fee2e2' },
};

// ─── In-memory cache ───────────────────────────────────────────────────────────
const dataCache = {};

function loadModelData(modelKey) {
  if (dataCache[modelKey]) return dataCache[modelKey];

  const modelInfo = MODELS[modelKey];
  if (!modelInfo) throw new Error(`Unknown model: ${modelKey}`);

  console.log(`📂 Loading ${modelInfo.label} data...`);
  const raw = fs.readFileSync(modelInfo.file, 'utf8');
  const parsed = JSON.parse(raw);
  dataCache[modelKey] = parsed;
  console.log(`✅ Loaded ${Object.keys(parsed).length - 1} properties for ${modelInfo.label}`);
  return parsed;
}

// ─── Reviews file helpers ─────────────────────────────────────────────────────
function loadReviews() {
  if (!fs.existsSync(REVIEWS_PATH)) return { sessions: [], summary: {} };
  try {
    return JSON.parse(fs.readFileSync(REVIEWS_PATH, 'utf8'));
  } catch {
    return { sessions: [], summary: {} };
  }
}

function saveReviews(data) {
  fs.writeFileSync(REVIEWS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// Rebuild summary stats from sessions
function rebuildSummary(sessions) {
  const summary = {};

  for (const session of sessions) {
    const { modelKey, propertyName, reviews } = session;
    if (!summary[modelKey]) summary[modelKey] = {};
    if (!summary[modelKey][propertyName]) {
      summary[modelKey][propertyName] = {
        reviewedAt: session.completedAt,
        byLabel: {},
        totalSentences: 0,
        correctCount: 0,
        partialCount: 0,
        incorrectCount: 0,
      };
    }

    const prop = summary[modelKey][propertyName];
    prop.reviewedAt = session.completedAt;

    for (const review of reviews) {
      const lbl = review.labelCode;
      if (!prop.byLabel[lbl]) {
        prop.byLabel[lbl] = { total: 0, correct: 0, partial: 0, incorrect: 0 };
      }
      prop.byLabel[lbl].total++;
      prop.totalSentences++;

      if (review.verdict === 'correct') { prop.byLabel[lbl].correct++; prop.correctCount++; }
      else if (review.verdict === 'partial') { prop.byLabel[lbl].partial++; prop.partialCount++; }
      else { prop.byLabel[lbl].incorrect++; prop.incorrectCount++; }
    }
  }

  return summary;
}

// ─── Sampling helper ──────────────────────────────────────────────────────────
function sampleByLabel(items) {
  // Group by label
  const byLabel = {};
  for (const item of items) {
    if (!item.label) continue;
    if (!byLabel[item.label]) byLabel[item.label] = [];
    byLabel[item.label].push(item);
  }

  const sampled = [];
  for (const [label, count] of Object.entries(SAMPLE_CONFIG)) {
    if (!byLabel[label] || byLabel[label].length === 0) continue;
    const pool = byLabel[label];
    // Shuffle deterministically by index for reproducibility
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    sampled.push(...shuffled.slice(0, count));
  }

  return sampled;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/models
app.get('/api/models', (req, res) => {
  res.json(Object.values(MODELS).map(m => ({
    key: m.key,
    label: m.label,
    provider: m.provider,
    color: m.color,
    icon: m.icon
  })));
});

// GET /api/properties/:modelKey
app.get('/api/properties/:modelKey', (req, res) => {
  try {
    const data = loadModelData(req.params.modelKey);
    const reviews = loadReviews();
    const reviewedProps = new Set(
      (reviews.sessions || [])
        .filter(s => s.modelKey === req.params.modelKey && s.completed)
        .map(s => s.propertyName)
    );

    const properties = Object.entries(data)
      .filter(([k]) => k !== '_meta')
      .map(([name, propData]) => {
        const items = propData.items || [];
        const labelCounts = {};
        for (const item of items) {
          if (item.label) labelCounts[item.label] = (labelCounts[item.label] || 0) + 1;
        }
        return {
          name,
          domain: propData.property_domain || '?',
          range: propData.property_range || '?',
          totalSentences: items.length,
          labelCounts,
          reviewed: reviewedProps.has(name),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(properties);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sentences/:modelKey/:propertyName
app.get('/api/sentences/:modelKey/:propertyName', (req, res) => {
  try {
    const { modelKey, propertyName } = req.params;
    const data = loadModelData(modelKey);
    const propData = data[propertyName];

    if (!propData) {
      return res.status(404).json({ error: `Property "${propertyName}" not found` });
    }

    const sampled = sampleByLabel(propData.items || []);
    const modelInfo = MODELS[modelKey];

    res.json({
      property: {
        name: propertyName,
        domain: propData.property_domain || '?',
        range: propData.property_range || '?',
      },
      model: {
        key: modelKey,
        label: modelInfo.label,
        color: modelInfo.color,
      },
      labelMeta: LABEL_META,
      sentences: sampled.map(item => ({
        index: item.index,
        text: item.text,
        label: item.label,
        labelMeta: LABEL_META[item.label] || null,
        subjectText: item.subject_text || '',
        objectText: item.object_text || '',
        model: item.model,
        lastUpdated: item.last_updated,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/submit-session
app.post('/api/submit-session', (req, res) => {
  try {
    const { modelKey, propertyName, reviews } = req.body;

    if (!modelKey || !propertyName || !Array.isArray(reviews)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const data = loadReviews();

    const session = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      modelKey,
      propertyName,
      reviews,
      completed: true,
      completedAt: new Date().toISOString(),
    };

    data.sessions.push(session);
    data.summary = rebuildSummary(data.sessions);
    saveReviews(data);

    res.json({ ok: true, sessionId: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reviews
app.get('/api/reviews', (req, res) => {
  res.json(loadReviews());
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  const data = loadReviews();
  const stats = {
    totalSessions: data.sessions.length,
    byModel: {},
    summary: data.summary
  };

  for (const session of (data.sessions || [])) {
    if (!stats.byModel[session.modelKey]) {
      stats.byModel[session.modelKey] = { properties: 0, sentences: 0, correct: 0, partial: 0, incorrect: 0 };
    }
    const m = stats.byModel[session.modelKey];
    m.properties++;
    m.sentences += session.reviews.length;
    for (const r of session.reviews) {
      if (r.verdict === 'correct') m.correct++;
      else if (r.verdict === 'partial') m.partial++;
      else m.incorrect++;
    }
  }

  res.json(stats);
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Ontology Label Review Tool`);
  console.log(`   → http://localhost:${PORT}\n`);
  console.log(`   Gemini file : ${MODELS.gemini.file}`);
  console.log(`   GPT file    : ${MODELS.gpt.file}`);
  console.log(`   Reviews out : ${REVIEWS_PATH}\n`);
});
