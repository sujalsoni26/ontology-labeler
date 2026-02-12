import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import LabelSentence from './LabelSentence';

export default function UserLabels({ userId }) {
  const [labels, setLabels] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingLabel, setEditingLabel] = useState(null);
  const [filters, setFilters] = useState({
    propertyId: 'all',
    labelType: 'all',
    timeOrder: 'newest', // 'newest' or 'oldest'
    search: '',
    showPartial: 'all' // 'all', 'complete', 'partial'
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
      .select('*, sentences:sentence_id (text, property_id, label_count)')
      .eq('user_id', userId);

    if (error) {
      console.error(error);
    } else {
      // Map to flat structure
      const flat = userLabels.map(l => ({
        ...l,
        sentence_text: l.sentences?.text,
        property_id: l.sentences?.property_id,
        label_count: l.sentences?.label_count
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

  const filteredLabels = labels
    .filter(l => {
      const matchProp = filters.propertyId === 'all' || String(l.property_id) === String(filters.propertyId);
      const matchType = filters.labelType === 'all' || l.label === filters.labelType;
      const matchSearch = !filters.search || (l.sentence_text && l.sentence_text.toLowerCase().includes(filters.search.toLowerCase()));
      const matchPartial = filters.showPartial === 'all' 
        ? true 
        : filters.showPartial === 'partial' 
          ? l.is_partial 
          : !l.is_partial;
      return matchProp && matchType && matchSearch && matchPartial;
    })
    .sort((a, b) => {
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      return filters.timeOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

  const getPropertyName = (pid) => {
    const p = properties.find(prop => prop.id === pid);
    return p ? p.name : pid;
  };

  const handleEdit = (label) => {
    setEditingLabel(label);
  };

  const handleUpdate = async (delta) => {
    if (delta !== 0 && editingLabel) {
      const newCount = Math.max(0, (editingLabel.label_count || 0) + delta);
      
      const rpcName = delta > 0 ? 'increment_label_count' : 'decrement_label_count';
      const { error: updateError } = await supabase
        .rpc(rpcName, { sentence_id_input: editingLabel.sentence_id });
      
      if (updateError) {
        console.error(`Failed to ${delta > 0 ? 'increment' : 'decrement'} label count via RPC:`, updateError);
        // Fallback to direct update
        const { error: directError } = await supabase
          .from('sentences')
          .update({ label_count: newCount })
          .eq('id', editingLabel.sentence_id);
        
        if (directError) {
          console.error("Fallback direct update also failed:", directError);
        }
      }
    }
    setEditingLabel(null);
    loadData(); // Refresh list
  };

  if (loading) return <div className="loading">Loading history...</div>;

  return (
    <div className="container">
      <header className="header" style={{ paddingLeft: '20px' }}>
        <div className="header-content">
          <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <h1 style={{ fontSize: '1.5rem', margin: 0 }}>My Labeling History</h1>
          </div>
        </div>
      </header>

      {editingLabel ? (
        <div className="card" style={{ padding: '32px' }}>
            <div className="toolbar" style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '32px', borderBottom: '1px solid var(--border-color)', paddingBottom: '20px' }}>
                <button className="btn-secondary btn-icon-text" onClick={() => setEditingLabel(null)}>
                    ← Back to list
                </button>
                <h3 style={{ margin: 0 }}>Editing Label</h3>
                <div style={{ marginLeft: 'auto' }}>
                    <span className="badge-property">{getPropertyName(editingLabel.property_id)}</span>
                </div>
            </div>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                <LabelSentence
                    sentence={{ id: editingLabel.sentence_id, text: editingLabel.sentence_text }}
                    existingLabel={editingLabel}
                    userId={userId}
                    propertyId={editingLabel.property_id}
                    onSaved={handleUpdate}
                />
            </div>
        </div>
      ) : (
        <div className="history-view">
          <div className="card filters-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>Filters</h3>
              <div className="stats-row" style={{ display: 'flex', gap: '20px', margin: 0, fontSize: '0.9em', color: 'var(--text-secondary)' }}>
                <span>Total: <strong style={{ color: 'var(--text-primary)' }}>{labels.length}</strong></span>
                <span>Filtered: <strong style={{ color: 'var(--text-primary)' }}>{filteredLabels.length}</strong></span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
              <div className="filter-group" style={{ gridColumn: '1 / -1' }}>
                <label>Search sentences:</label>
                <input
                  type="text"
                  placeholder="Type to search in sentence text..."
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
                  <option value="all">All Label Types</option>
                  <option value="pdr">Full Alignment (PDR)</option>
                  <option value="pd">Domain Aligned (PD)</option>
                  <option value="pr">Range Aligned (PR)</option>
                  <option value="p">Incorrect D&R (P)</option>
                  <option value="n">No Alignment (N)</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Labeling Status:</label>
                <select
                  className="filter-select"
                  value={filters.showPartial}
                  onChange={e => setFilters(prev => ({ ...prev, showPartial: e.target.value }))}
                >
                  <option value="all">All Status</option>
                  <option value="complete">Fully Labeled</option>
                  <option value="partial">Partially Labeled</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Sort Order:</label>
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
          </div>

          <div className="labels-list">
            {filteredLabels.length === 0 ? (
                <div className="empty-state card">No labels match your filters.</div>
            ) : (
                filteredLabels.map(l => (
                    <div key={l.id} className="card label-item" style={{ padding: '16px' }}>
                        <div className="label-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span className="badge-property" style={{ fontSize: '0.75em', padding: '2px 6px' }}>{getPropertyName(l.property_id)}</span>
                                <span className={`badge-label label-${l.label}`} style={{ fontSize: '0.75em', padding: '2px 6px' }}>{l.label.toUpperCase()}</span>
                                {l.is_partial && (
                                    <span 
                                        className="badge-partial" 
                                        style={{ 
                                            fontSize: '0.75em', 
                                            padding: '2px 6px', 
                                            margin: 0,
                                            backgroundColor: '#607d8b' // Slate/Blue Grey for distinction
                                        }}
                                    >
                                        PARTIAL
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span className="date-time" style={{ fontSize: '0.8em', opacity: 0.6 }}>
                                    {new Date(l.created_at).toLocaleDateString('en-US', { 
                                        month: 'short', 
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}
                                </span>
                                <button 
                                    className="btn-secondary small btn-icon-text" 
                                    onClick={() => handleEdit(l)}
                                    style={{ padding: '4px 10px', fontSize: '0.85em' }}
                                >
                                    Edit
                                </button>
                            </div>
                        </div>
                        <p className="sentence-preview" style={{ 
                            fontSize: '0.95rem', 
                            lineHeight: '1.4', 
                            margin: 0, 
                            color: 'var(--text-primary)',
                            display: '-webkit-box',
                            WebkitLineClamp: '2',
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {l.sentence_text}
                        </p>
                    </div>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
