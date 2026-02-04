import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import LabelSentence from './LabelSentence';

export default function UserLabels({ userId, onBack }) {
  const [labels, setLabels] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingLabel, setEditingLabel] = useState(null);
  const [filters, setFilters] = useState({
    propertyId: 'all',
    labelType: 'all',
    timeOrder: 'newest', // 'newest' or 'oldest'
    search: ''
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    // Fetch properties for context
    const { data: props } = await supabase.from('properties').select('*');
    setProperties(props || []);

    // Fetch user labels joined with sentences
    // Since Supabase join syntax is tricky without defined relationships, we might fetch manually
    // But 'labels' has sentence_id.
    // Let's fetch all labels for user.
    const { data: userLabels, error } = await supabase
      .from('labels')
      .select('*, sentences:sentence_id (text, property_id)')
      .eq('user_id', userId);

    if (error) {
      console.error(error);
    } else {
      // Map to flat structure
      const flat = userLabels.map(l => ({
        ...l,
        sentence_text: l.sentences?.text,
        property_id: l.sentences?.property_id
      }));
      setLabels(flat);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const id = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(id);
  }, [userId, loadData]);

  const filteredLabels = labels.filter(l => {
    if (filters.propertyId !== 'all' && l.property_id !== Number(filters.propertyId)) return false;
    if (filters.labelType !== 'all' && l.label !== filters.labelType) return false;
    if (filters.search && !l.sentence_text.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    const dateA = new Date(a.created_at || 0); // Assuming created_at exists, fallback to 0
    const dateB = new Date(b.created_at || 0);
    if (filters.timeOrder === 'newest') return dateB - dateA;
    return dateA - dateB;
  });

  const getPropertyName = (pid) => {
    const p = properties.find(prop => prop.id === pid);
    return p ? p.name : pid;
  };

  const handleEdit = (label) => {
    setEditingLabel(label);
  };

  const handleUpdate = () => {
    setEditingLabel(null);
    loadData(); // Refresh list
  };

  if (loading) return <div className="loading">Loading history...</div>;

  return (
    <div className="container">
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <button className="btn-secondary btn-icon-text btn-back" onClick={onBack}>
              &larr; Back to Labeling
            </button>
            <h1>My Labeling History</h1>
          </div>
        </div>
      </header>

      {editingLabel ? (
        <div className="card">
            <div className="toolbar">
                <button className="btn-secondary btn-icon-text" onClick={() => setEditingLabel(null)}>&larr; Back to list</button>
                <h3>Editing Label</h3>
            </div>
            <LabelSentence
                sentence={{ id: editingLabel.sentence_id, text: editingLabel.sentence_text }}
                existingLabel={editingLabel}
                userId={userId}
                propertyId={editingLabel.property_id}
                onSaved={handleUpdate}
            />
        </div>
      ) : (
        <div className="history-view">
          <div className="card filters-card">
            <h3>Filters</h3>
            <div className="filters-row">
              <div className="filter-group">
                <label>Search text:</label>
                <input
                  type="text"
                  placeholder="Search sentences..."
                  className="search-input"
                  value={filters.search}
                  onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                />
              </div>
              
              <div className="filter-group">
                <label>Property:</label>
                <select
                  className="filter-select"
                  value={filters.propertyId}
                  onChange={e => setFilters(prev => ({ ...prev, propertyId: e.target.value }))}
                >
                  <option value="all">All Properties</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>Label Type:</label>
                <select
                  className="filter-select"
                  value={filters.labelType}
                  onChange={e => setFilters(prev => ({ ...prev, labelType: e.target.value }))}
                >
                  <option value="all">All Labels</option>
                  <option value="pdr">Full Alignment (PDR)</option>
                  <option value="pd">Domain Aligned (PD)</option>
                  <option value="pr">Range Aligned (PR)</option>
                  <option value="p">Incorrect D&R (P)</option>
                  <option value="n">No Alignment (N)</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Time Labeled:</label>
                <select
                  className="filter-select"
                  value={filters.timeOrder}
                  onChange={e => setFilters(prev => ({ ...prev, timeOrder: e.target.value }))}
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
              </div>
            </div>
            
            <div className="stats-row">
                <span>Total Labeled: <strong>{labels.length}</strong></span>
                <span><br/>Filtered: <strong>{filteredLabels.length}</strong></span>
            </div>
          </div>

          <div className="labels-list">
            {filteredLabels.length === 0 ? (
                <div className="empty-state">No labels match your filters.</div>
            ) : (
                filteredLabels.map(l => (
                    <div key={l.id} className="card label-item">
                        <div className="label-header">
                            <span className="badge-property">{getPropertyName(l.property_id)}</span>
                            <span className={`badge-label label-${l.label}`}>{l.label.toUpperCase()}</span>
                            <span className="date-time">{new Date(l.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="sentence-preview">{l.sentence_text}</p>
                        <div className="label-actions">
                            <button className="btn-secondary small" onClick={() => handleEdit(l)}>Edit</button>
                        </div>
                    </div>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
