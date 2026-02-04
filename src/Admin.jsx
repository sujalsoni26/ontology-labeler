import { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function Admin({ user, onBack }) {
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState('');
  const [minLabels, setMinLabels] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  
  // Stats state
  const [stats, setStats] = useState({
    totalSentences: 0,
    labeledSentences: 0,
    labelDistribution: { 1: 0, 2: 0, 3: 0, 5: 0 },
    topUsers: []
  });

  if (user?.email !== 'admin@local.auth') {
    return (
      <div className="container">
        <header className="header">
          <div className="header-content">
            <button className="btn-secondary btn-icon-text" onClick={onBack}>
               ← Back
            </button>
            <h1>Access Denied</h1>
          </div>
        </header>
        <main className="main-content">
          <div className="card">
             <div className="error-message">You do not have permission to view this page.</div>
          </div>
        </main>
      </div>
    );
  }

  useEffect(() => {
    const loadProps = async () => {
      const { data } = await supabase.from('properties').select('*').order('name');
      setProperties(data || []);
    };
    
    const loadStats = async () => {
        // 1. Total Sentences
        const { count: total } = await supabase
            .from('sentences')
            .select('*', { count: 'exact', head: true });

        // 2. Sentences with at least one label
        const { count: labeledCount } = await supabase
            .from('sentences')
            .select('*', { count: 'exact', head: true })
            .gt('label_count', 0);

        // 3. Distribution (sentences labeled > K times)
        // We fetch label_counts to compute distribution client-side for flexibility
        // Note: For very large datasets, this should be an RPC or careful query
        const { data: countData } = await supabase
            .from('sentences')
            .select('label_count')
            .gt('label_count', 0);
        
        const dist = { 1: 0, 2: 0, 3: 0, 5: 0 };
        (countData || []).forEach(row => {
            if (row.label_count >= 1) dist[1]++;
            if (row.label_count >= 2) dist[2]++;
            if (row.label_count >= 3) dist[3]++;
            if (row.label_count >= 5) dist[5]++;
        });

        // 4. Top Users
        // Fetch all labels to aggregate by user_id
        // Ideally this should be a view or RPC for performance
        const { data: labels } = await supabase
            .from('labels')
            .select('user_id');
        
        const userCounts = {};
        (labels || []).forEach(l => {
            userCounts[l.user_id] = (userCounts[l.user_id] || 0) + 1;
        });

        const sortedUsers = Object.entries(userCounts)
            .map(([id, count]) => ({ id, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10); // Top 10

        setStats({
            totalSentences: total || 0,
            labeledSentences: labeledCount || 0,
            labelDistribution: dist,
            topUsers: sortedUsers
        });
    };

    loadProps();
    loadStats();
  }, []);

  const downloadJSON = (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fetchPropertyData = async (propertyId, minCount = 1) => {
    // 1. Fetch Sentences
    let query = supabase
      .from('sentences')
      .select('id, text')
      .eq('property_id', propertyId);
    
    if (minCount > 0) {
        query = query.gte('label_count', minCount);
    }

    const { data: sents, error: sErr } = await query;
    
    if (sErr) throw sErr;
    if (!sents || sents.length === 0) return [];

    const ids = sents.map(s => s.id);
    const textById = sents.reduce((acc, s) => {
      acc[s.id] = s.text;
      return acc;
    }, {});

    // 2. Fetch Labels
    // Fetch in batches if necessary, but for now assuming it fits
    const { data: lbls, error: lErr } = await supabase
      .from('labels')
      .select('*')
      .in('sentence_id', ids);

    if (lErr) throw lErr;

    // 3. Merge
    return (lbls || []).map(l => ({
      sentence_id: l.sentence_id,
      sentence_text: textById[l.sentence_id],
      property_id: l.property_id,
      user_id: l.user_id,
      label: l.label,
      subject_start: l.subject_start,
      subject_end: l.subject_end,
      object_start: l.object_start,
      object_end: l.object_end,
      created_at: l.created_at
    }));
  };

  const handleExportSingle = async () => {
    if (!selectedProperty) return;
    setLoading(true);
    setStatus(`Fetching data (Min Labels: ${minLabels})...`);
    try {
      const data = await fetchPropertyData(selectedProperty, minLabels);
      if (data.length === 0) {
        setStatus('No labels found matching criteria.');
      } else {
        const prop = properties.find(p => String(p.id) === String(selectedProperty));
        const propName = prop ? prop.name.replace(/[^a-z0-9]/gi, '_') : selectedProperty;
        downloadJSON(data, `${propName}_min${minLabels}_labels.json`);
        setStatus(`Exported ${data.length} labels.`);
      }
    } catch (err) {
      console.error(err);
      setStatus('Error exporting data.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportAll = async () => {
    setLoading(true);
    setStatus(`Fetching all data (Min Labels: ${minLabels})...`);
    try {
      let allData = [];
      for (const prop of properties) {
        setStatus(`Fetching property: ${prop.name}...`);
        const data = await fetchPropertyData(prop.id, minLabels);
        allData = allData.concat(data);
      }
      
      if (allData.length === 0) {
        setStatus('No labels found matching criteria.');
      } else {
        downloadJSON(allData, `all_properties_min${minLabels}_labels.json`);
        setStatus(`Exported ${allData.length} labels from ${properties.length} properties.`);
      }
    } catch (err) {
      console.error(err);
      setStatus('Error exporting all data.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <div className="header-content">
          <button className="btn-secondary btn-icon-text" onClick={onBack}>
             ← Back
          </button>
          <h1>Admin Dashboard</h1>
          <div style={{ width: '80px' }}></div>
        </div>
      </header>

      <main className="main-content">
        {/* Stats Section */}
        <div className="card profile-card" style={{ marginBottom: '20px' }}>
            <div className="profile-header">
                <h2>Labeling Statistics</h2>
            </div>
            <div className="stats-grid">
                <div className="stat-item">
                    <span className="stat-value">{stats.totalSentences}</span>
                    <span className="stat-label">Total Sentences</span>
                </div>
                <div className="stat-item">
                    <span className="stat-value">{stats.labeledSentences}</span>
                    <span className="stat-label">Labeled (at least once)</span>
                </div>
                <div className="stat-item">
                    <span className="stat-value">
                        {stats.totalSentences > 0 
                            ? Math.round((stats.labeledSentences / stats.totalSentences) * 100) 
                            : 0}%
                    </span>
                    <span className="stat-label">Coverage</span>
                </div>
            </div>

            <h3 style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '15px' }}>
                Redundancy (Sentences labeled ≥ K times)
            </h3>
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                 <div className="stat-item">
                    <span className="stat-value">{stats.labelDistribution[1]}</span>
                    <span className="stat-label">≥ 1</span>
                </div>
                <div className="stat-item">
                    <span className="stat-value">{stats.labelDistribution[2]}</span>
                    <span className="stat-label">≥ 2</span>
                </div>
                <div className="stat-item">
                    <span className="stat-value">{stats.labelDistribution[3]}</span>
                    <span className="stat-label">≥ 3</span>
                </div>
                <div className="stat-item">
                    <span className="stat-value">{stats.labelDistribution[5]}</span>
                    <span className="stat-label">≥ 5</span>
                </div>
            </div>

            <h3 style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '15px' }}>
                Top Contributors
            </h3>
            <div className="top-users-list">
                {stats.topUsers.length === 0 ? (
                    <div style={{ padding: '10px', color: 'var(--text-secondary)' }}>No contributions yet.</div>
                ) : (
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '8px' }}>User ID</th>
                                <th style={{ padding: '8px', textAlign: 'right' }}>Labels</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats.topUsers.map((u, i) => (
                                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '0.9em' }}>
                                        {u.id === user.id ? 'You (Admin)' : u.id.slice(0, 8) + '...'}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{u.count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>

        <div className="card profile-card"> {/* Reusing profile-card style for width */}
           <div className="profile-header">
             <h2>Data Export</h2>
             <p className="label-desc">Restricted Access: {user.email}</p>
           </div>

           <div className="controls-area" style={{ alignItems: 'center' }}>
             
             {/* Filter Section */}
             <div className="input-group" style={{ width: '100%', marginBottom: '15px' }}>
                <label>Minimum Label Count (K)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input 
                        type="number" 
                        min="1" 
                        value={minLabels} 
                        onChange={e => setMinLabels(Math.max(1, parseInt(e.target.value) || 1))}
                        className="input-field"
                        style={{ width: '100px' }}
                    />
                    <small style={{ color: 'var(--text-secondary)' }}>
                        Export only sentences labeled at least {minLabels} time{minLabels !== 1 ? 's' : ''}.
                    </small>
                </div>
             </div>

             <div className="input-group" style={{ width: '100%' }}>
               <label>Select Property to Export</label>
               <select 
                 className="property-dropdown"
                 value={selectedProperty}
                 onChange={(e) => setSelectedProperty(e.target.value)}
                 disabled={loading}
               >
                 <option value="">-- Choose Property --</option>
                 {properties.map(p => (
                   <option key={p.id} value={p.id}>{p.name}</option>
                 ))}
               </select>
             </div>

             <button 
                className="btn-primary btn-full" 
                onClick={handleExportSingle}
                disabled={!selectedProperty || loading}
             >
               {loading && selectedProperty ? 'Exporting...' : 'Export Selected Property'}
             </button>

             <hr style={{ width: '100%', borderColor: 'var(--border-color)', margin: '20px 0' }} />

             <button 
                className="btn-secondary btn-full" 
                onClick={handleExportAll}
                disabled={loading}
                style={{ borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }}
             >
               {loading && !selectedProperty ? 'Exporting All...' : 'Export ALL Data'}
             </button>

             {status && (
               <div className="info-box" style={{ marginTop: '20px', width: '100%', textAlign: 'center' }}>
                 {status}
               </div>
             )}
           </div>
        </div>
      </main>
    </div>
  );
}
