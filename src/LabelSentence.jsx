import { supabase } from './supabase';
import { useMemo, useState } from 'react';

export default function LabelSentence({ sentence, existingLabel, userId, propertyId, onSaved, onNextUnlabeled, onPrevUnlabeled }) {
  const [label, setLabel] = useState(existingLabel?.label || null);
  const [mode, setMode] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [subject, setSubject] = useState(
    existingLabel && existingLabel.subject_start != null
      ? { start: existingLabel.subject_start, end: existingLabel.subject_end }
      : null
  );
  const [objectSpan, setObjectSpan] = useState(
    existingLabel && existingLabel.object_start != null
      ? { start: existingLabel.object_start, end: existingLabel.object_end }
      : null
  );
  const tokens = useMemo(() => sentence.text.split(/\s+/), [sentence.text]);

  const pickIndex = (idx) => {
    if (mode === 'subject') {
      if (!subject) {
        setSubject({ start: idx, end: idx });
      } else {
        const start = Math.min(subject.start, idx);
        const end = Math.max(subject.start, idx);
        setSubject({ start, end });
        setMode(null);
      }
    } else if (mode === 'object') {
      if (!objectSpan) {
        setObjectSpan({ start: idx, end: idx });
      } else {
        const start = Math.min(objectSpan.start, idx);
        const end = Math.max(objectSpan.start, idx);
        setObjectSpan({ start, end });
        setMode(null);
      }
    }
  };

  const validate = () => {
    if (!label) return 'Choose a label';

    if (label === 'pdr') {
      return subject && objectSpan ? null : 'Select subject and object spans';
    }
    if (label === 'pd') {
      if (!subject) return 'Select subject span';
      if (objectSpan) return 'Clear object span for "pd" (Property Domain)';
      return null;
    }
    if (label === 'pr') {
      if (!objectSpan) return 'Select object span';
      if (subject) return 'Clear subject span for "pr" (Property Range)';
      return null;
    }
    if (label === 'p') {
      // For p(?, ?), user does not need to select subject or object (optional)
      return null;
    }
    if (label === 'n') {
      return !subject && !objectSpan ? null : 'No spans should be selected for "n"';
    }
    return null;
  };

  const saveLabel = async () => {
    const err = validate();
    if (err) {
      alert(err);
      return;
    }
    const payload = {
      sentence_id: sentence.id,
      user_id: userId,
      property_id: propertyId,
      label,
      subject_start: subject ? subject.start : null,
      subject_end: subject ? subject.end : null,
      object_start: objectSpan ? objectSpan.start : null,
      object_end: objectSpan ? objectSpan.end : null,
    };
    const { error } = await supabase
      .from('labels')
      .upsert(payload, { onConflict: 'sentence_id,user_id' });
    if (error) {
      alert(error.message);
    } else {
      // alert('Saved'); // Optional: removed alert for smoother flow
      if (onSaved) onSaved(!existingLabel);
    }
  };

  return (
    <div className="label-sentence-container">
      <div className="sentence-text">
        {tokens.map((t, i) => {
          let className = 'token';
          let isSubjectStart = false;
          let isObjectStart = false;

          if (subject && i >= subject.start && i <= subject.end) {
            className += ' subject';
            if (i === subject.start) isSubjectStart = true;
          }
          if (objectSpan && i >= objectSpan.start && i <= objectSpan.end) {
            className += ' object';
            if (i === objectSpan.start) isObjectStart = true;
          }
          
          if (isSubjectStart) className += ' subject-start';
          if (isObjectStart) className += ' object-start';

          return (
            <span
              key={i}
              className={className}
              onClick={() => pickIndex(i)}
            >
              {t}
            </span>
          );
        })}
      </div>

      <div className="controls-area">
        <div className="span-selection-controls">
          <button 
            className={`btn-secondary btn-select-subject ${mode === 'subject' ? 'active' : ''}`}
            onClick={() => setMode(mode === 'subject' ? null : 'subject')}
          >
            {mode === 'subject' ? 'Selecting Subject...' : 'Select Subject'}
          </button>
          <button 
            className={`btn-secondary btn-select-object ${mode === 'object' ? 'active' : ''}`}
            onClick={() => setMode(mode === 'object' ? null : 'object')}
          >
            {mode === 'object' ? 'Selecting Object...' : 'Select Object'}
          </button>
          <button className="btn-danger small" onClick={() => setSubject(null)}>Clear Subj</button>
          <button className="btn-danger small" onClick={() => setObjectSpan(null)}>Clear Obj</button>
        </div>

        <div className="label-options">
          <div className="label-header">
            <h3>Alignment Label</h3>
            <button 
              className="btn-icon" 
              onClick={() => setShowInfo(!showInfo)}
              title="What is alignment?"
            >
              ℹ️ Help
            </button>
          </div>

          {showInfo && (
            <div className="info-box">
              <h4>How to Label</h4>
              <ul>
                  <li><strong>Select Subject:</strong> Click "Select Subject" then click the first and last word of the subject phrase.</li>
                  <li><strong>Select Object:</strong> Click "Select Object" then click the first and last word of the object phrase.</li>
                  <li><strong>Deselect:</strong> Click "Clear Subj" or "Clear Obj" to remove the selection.</li>
              </ul>
              
              <h4>Alignment Guide</h4>
              <p>
                <strong>Alignment</strong> verifies how closely a property is expressed in a sentence in terms of its ontological definition of domain and range.
              </p>
              <p>Given a Property(Domain, Range), choose one of the 5 labels:</p>
              <ul>
                <li><strong>Full alignment: p(D, R)</strong>: When the property is expressed and the textual entities or their references comply with the domain and range.</li>
                <li><strong>Property and domain are aligned: p(D, ?)</strong></li>
                <li><strong>Property and range are aligned: p(?, R)</strong></li>
                <li><strong>Property expressed, but both domain and range do not align: p(?, ?)</strong></li>
                <li><strong>No alignment</strong></li>
              </ul>
            </div>
          )}

          <div className="label-grid">
            {[
              { id: 'pdr', label: 'Full alignment: p(D, R)', desc: 'Property, Domain & Range match' },
              { id: 'pd', label: 'Property and domain are aligned: p(D, ?)', desc: 'Only Domain matches' },
              { id: 'pr', label: 'Property and range are aligned: p(?, R)', desc: 'Only Range matches' },
              { id: 'p', label: 'Property expressed, but D&R do not align: p(?, ?)', desc: 'Only Property matches' },
              { id: 'n', label: 'No alignment', desc: 'Not relevant' }
            ].map(opt => (
              <button
                key={opt.id}
                className={`label-btn type-${opt.id} ${label === opt.id ? 'active' : ''}`}
                onClick={() => setLabel(label === opt.id ? null : opt.id)}
              >
                <span className="label-title">{opt.label}</span>
                {/* <span className="label-desc">{opt.desc}</span> */} 
              </button>
            ))}
          </div>
        </div>

        <button className="btn-primary" onClick={saveLabel} style={{ width: '100%' }}>
          Save Label
        </button>

        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
             <button className="btn-secondary small" onClick={onPrevUnlabeled} style={{ flex: 1 }}>
                ← Prev Unlabeled
             </button>
             <button className="btn-secondary small" onClick={onNextUnlabeled} style={{ flex: 1 }}>
                Next Unlabeled →
             </button>
        </div>
      </div>
    </div>
  );
}
