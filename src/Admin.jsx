import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabase';
import { LayoutDashboard, Eye, EyeOff, Search, CheckSquare, Square, RefreshCcw } from 'lucide-react';

export default function Admin({ user }) {
  const [properties, setProperties] = useState([]);
  const [pendingChanges, setPendingChanges] = useState({}); // Track changes as { id: boolean }
  const [selectedProperty, setSelectedProperty] = useState('');
  const [minLabels, setMinLabels] = useState(1);
  const [topN, setTopN] = useState(10);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('all'); // 'all', 'visible', 'hidden'
  const [visibilityUpdating, setVisibilityUpdating] = useState(false);
  const [propPage, setPropPage] = useState(1);
  const [contributorSearchQuery, setContributorSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('adminActiveTab') || 'stats';
  });
  const PROP_PAGE_SIZE = 50;

  // Sync tab to localStorage
  useEffect(() => {
    localStorage.setItem('adminActiveTab', activeTab);
  }, [activeTab]);
  
  // Stats state
  const [stats, setStats] = useState({
    totalSentences: 0,
    labeledSentences: 0,
    labelDistribution: { 1: 0, 2: 0, 3: 0, 5: 0 },
    topUsers: []
  });

  const hasChanges = Object.keys(pendingChanges).length > 0;

  if (user?.email !== 'ontologylabeling@gmail.com') {
    return (
      <div className="container">
        <header className="header">
        <div className="header-content" style={{ paddingLeft: '60px' }}>
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

  const loadProps = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .order('name');
    
    if (error) {
      console.error("Error loading properties:", error);
    } else {
      setProperties(data || []);
      setPendingChanges({});
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProps();
    
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

        // 4. Top Users (Using the profiles table directly)
        const fetchLimit = parseInt(topN) || 0;
        if (fetchLimit <= 0) {
            setStats(prev => ({ ...prev, topUsers: [] }));
            return;
        }

        // Fetch top contributors directly from the profiles table
        const { data: topProfiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, full_name, email, total_labels')
            .order('total_labels', { ascending: false })
            .limit(fetchLimit);

        if (profilesError) {
            console.error("Error fetching top contributors from profiles:", profilesError);
        }

        setStats({
            totalSentences: total || 0,
            labeledSentences: labeledCount || 0,
            labelDistribution: dist,
            topUsers: (topProfiles || []).map(p => ({
                id: p.id,
                name: p.full_name && p.full_name.trim() !== '' ? p.full_name : '-',
                email: p.email || '-',
                count: p.total_labels || 0
            }))
        });
    };

    loadStats();
    setCurrentPage(1); // Reset to first page when topN changes
  }, [topN]);

  const handleToggleVisibility = (propId, currentIsActive) => {
    setPendingChanges(prev => {
      const original = properties.find(p => p.id === propId);
      const nextValue = !currentIsActive;
      
      const newChanges = { ...prev };
      if (nextValue === original.is_active) {
        delete newChanges[propId];
      } else {
        newChanges[propId] = nextValue;
      }
      return newChanges;
    });
  };

  // Optimization: use filtered properties from properties + pendingChanges
  const filteredProperties = useMemo(() => {
    return properties
      .filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        const currentIsActive = pendingChanges[p.id] !== undefined ? pendingChanges[p.id] : p.is_active;
        
        if (visibilityFilter === 'visible') return matchesSearch && currentIsActive;
        if (visibilityFilter === 'hidden') return matchesSearch && !currentIsActive;
        return matchesSearch;
      })
      .map(p => ({
        ...p,
        is_active: pendingChanges[p.id] !== undefined ? pendingChanges[p.id] : p.is_active
      }));
  }, [properties, searchQuery, pendingChanges, visibilityFilter]);

  const handleBulkVisibility = (visible) => {
    const newChanges = { ...pendingChanges };
    filteredProperties.forEach(p => {
      if (p.is_active !== visible) {
        newChanges[p.id] = visible;
      } else {
        delete newChanges[p.id];
      }
    });
    setPendingChanges(newChanges);
  };

  const handleSaveChanges = async () => {
    const changedIds = Object.keys(pendingChanges);
    if (changedIds.length === 0) return;

    setVisibilityUpdating(true);
    setStatus('Saving changes to database...');
    
    try {
      const toShow = changedIds.filter(id => pendingChanges[id] === true);
      const toHide = changedIds.filter(id => pendingChanges[id] === false);

      if (toShow.length > 0) {
        const { error: showErr } = await supabase
          .from('properties')
          .update({ is_active: true })
          .in('id', toShow);
        if (showErr) throw showErr;
      }

      if (toHide.length > 0) {
        const { error: hideErr } = await supabase
          .from('properties')
          .update({ is_active: false })
          .in('id', toHide);
        if (hideErr) throw hideErr;
      }

      // Update local base state
      setProperties(prev => prev.map(p => 
        pendingChanges[p.id] !== undefined ? { ...p, is_active: pendingChanges[p.id] } : p
      ));
      setPendingChanges({});
      setStatus(`Successfully saved changes to ${changedIds.length} properties.`);
    } catch (error) {
      console.error("Error saving changes:", error);
      setStatus(`Error: ${error.message || 'Check console for details'}`);
    } finally {
      setVisibilityUpdating(false);
    }
  };

  const handleCancelChanges = () => {
    setPendingChanges({});
    setStatus('');
  };

  const visibleCount = filteredProperties.filter(p => p.is_active !== false).length;

  const paginatedProperties = filteredProperties.slice(
    (propPage - 1) * PROP_PAGE_SIZE,
    propPage * PROP_PAGE_SIZE
  );
  const totalPropPages = Math.ceil(filteredProperties.length / PROP_PAGE_SIZE);

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

  // Pagination logic
   const effectivePageSize = Math.max(1, parseInt(pageSize) || 10);
   
   const filteredUsers = useMemo(() => {
     if (!contributorSearchQuery.trim()) return stats.topUsers;
     const query = contributorSearchQuery.toLowerCase().trim();
     return stats.topUsers.filter(u => 
       u.name.toLowerCase().includes(query) || 
       u.email.toLowerCase().includes(query)
     );
   }, [stats.topUsers, contributorSearchQuery]);

   const totalPages = Math.ceil(filteredUsers.length / effectivePageSize);
   const paginatedUsers = filteredUsers.slice(
     (currentPage - 1) * effectivePageSize,
     currentPage * effectivePageSize
   );

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
        <div className="header-content" style={{ paddingLeft: '60px' }}>
          <h1>Admin Dashboard</h1>
        </div>
      </header>

      <main className="main-content">
        {/* Tab Navigation */}
        <div className="tabs-container" style={{ 
          display: 'flex', 
          gap: '10px', 
          marginBottom: '20px',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '10px'
        }}>
          <button 
            className={`btn-sidebar-item ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
            style={{ 
              padding: '10px 20px', 
              borderRadius: '8px',
              background: activeTab === 'stats' ? 'var(--highlight-bg)' : 'transparent',
              color: activeTab === 'stats' ? 'var(--primary-color)' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === 'stats' ? 'bold' : 'normal',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <LayoutDashboard size={18} />
            <span>Statistics</span>
          </button>
          <button 
            className={`btn-sidebar-item ${activeTab === 'visibility' ? 'active' : ''}`}
            onClick={() => setActiveTab('visibility')}
            style={{ 
              padding: '10px 20px', 
              borderRadius: '8px',
              background: activeTab === 'visibility' ? 'var(--highlight-bg)' : 'transparent',
              color: activeTab === 'visibility' ? 'var(--primary-color)' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer', 
              fontWeight: activeTab === 'visibility' ? 'bold' : 'normal',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Eye size={18} />
            <span>Visibility Management</span>
          </button>
          <button 
            className={`btn-sidebar-item ${activeTab === 'export' ? 'active' : ''}`}
            onClick={() => setActiveTab('export')}
            style={{ 
              padding: '10px 20px', 
              borderRadius: '8px',
              background: activeTab === 'export' ? 'var(--highlight-bg)' : 'transparent',
              color: activeTab === 'export' ? 'var(--primary-color)' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === 'export' ? 'bold' : 'normal',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <RefreshCcw size={18} />
            <span>Data Export</span>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'stats' && (
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

            <div className="profile-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '30px' }}>
                 <h3 style={{ margin: 0 }}>Top Contributors</h3>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                     <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                         <Search size={14} style={{ position: 'absolute', left: '8px', color: 'var(--text-secondary)' }} />
                         <input 
                              type="text"
                              placeholder="Search by name or email..."
                              value={contributorSearchQuery}
                              onChange={(e) => {
                                  setContributorSearchQuery(e.target.value);
                                  setCurrentPage(1);
                              }}
                              style={{ 
                                  padding: '4px 8px 4px 28px', 
                                  borderRadius: '4px', 
                                  border: '1px solid var(--border-color)',
                                  background: 'var(--secondary-bg)',
                                  color: 'var(--text-primary)',
                                  fontSize: '0.85em',
                                  width: '200px'
                              }}
                          />
                      </div>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                         <label style={{ fontSize: '0.85em', color: 'var(--text-secondary)' }}>Fetch Top:</label>
                         <input 
                              type="number"
                              min="1"
                              max="1000"
                              className="no-arrows"
                              value={topN} 
                              onChange={(e) => setTopN(e.target.value)}
                              style={{ 
                                  width: '60px',
                                  padding: '2px 8px', 
                                  borderRadius: '4px', 
                                  border: '1px solid var(--border-color)',
                                  background: 'var(--secondary-bg)',
                                  color: 'var(--text-primary)',
                                  fontSize: '0.85em'
                              }}
                          />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <label style={{ fontSize: '0.85em', color: 'var(--text-secondary)' }}>Page Size:</label>
                          <input 
                              type="number"
                              min="1"
                              className="no-arrows"
                              value={pageSize} 
                              onChange={(e) => {
                                  setPageSize(e.target.value);
                                  setCurrentPage(1);
                              }}
                              style={{ 
                                  width: '50px',
                                  padding: '2px 8px', 
                                  borderRadius: '4px', 
                                  border: '1px solid var(--border-color)',
                                  background: 'var(--secondary-bg)',
                                  color: 'var(--text-primary)',
                                  fontSize: '0.85em'
                              }}
                          />
                     </div>
                 </div>
             </div>
            <div className="top-users-list">
                {stats.topUsers.length === 0 ? (
                    <div style={{ padding: '10px', color: 'var(--text-secondary)' }}>No contributions yet.</div>
                ) : filteredUsers.length === 0 ? (
                    <div style={{ padding: '10px', color: 'var(--text-secondary)' }}>No contributors found matching "{contributorSearchQuery}".</div>
                ) : (
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '8px', width: '60px' }}>Rank</th>
                                <th style={{ padding: '8px' }}>Name</th>
                                <th style={{ padding: '8px' }}>Email</th>
                                <th style={{ padding: '8px', textAlign: 'right' }}>Contribution</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedUsers.map((u, i) => (
                                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '0.85em' }}>
                                        #{(currentPage - 1) * effectivePageSize + i + 1}
                                    </td>
                                    <td style={{ padding: '8px', fontSize: '0.9em', fontWeight: '500' }}>
                                        {u.name}
                                    </td>
                                    <td style={{ padding: '8px', fontSize: '0.9em', color: 'var(--text-secondary)' }}>
                                        {u.email}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right', fontSize: '0.9em', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                                        {u.count.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    gap: '15px', 
                    marginTop: '15px',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--border-color)'
                }}>
                    <button 
                        className="btn-secondary" 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        style={{ padding: '4px 12px', fontSize: '0.85em' }}
                    >
                        Previous
                    </button>
                    <span style={{ fontSize: '0.85em', color: 'var(--text-secondary)' }}>
                        Page {currentPage} of {totalPages}
                    </span>
                    <button 
                        className="btn-secondary" 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        style={{ padding: '4px 12px', fontSize: '0.85em' }}
                    >
                        Next
                    </button>
                </div>
            )}
          </div>
        )}

        {activeTab === 'visibility' && (
          <div className="card profile-card" style={{ marginBottom: '20px' }}>
            <div className="profile-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2>Property Visibility</h2>
                <p className="label-desc">Control which properties are visible to users for labeling.</p>
              </div>
              <button 
                className="btn-secondary" 
                onClick={loadProps}
                disabled={loading || visibilityUpdating}
                style={{ padding: '8px', borderRadius: '50%' }}
                title="Refresh Properties"
              >
                <RefreshCcw size={18} className={loading ? 'spin' : ''} />
              </button>
            </div>

            <div className="visibility-controls" style={{ marginTop: '20px' }}>
              <div className="search-bar" style={{ position: 'relative', marginBottom: '15px' }}>
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                <input 
                  type="text" 
                  placeholder="Search properties..." 
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPropPage(1);
                  }}
                  style={{ 
                    width: '100%', 
                    padding: '10px 10px 10px 40px', 
                    borderRadius: '8px', 
                    border: '1px solid var(--border-color)',
                    background: 'var(--secondary-bg)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              <div className="filter-actions" style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <button 
                  className={`btn-secondary ${visibilityFilter === 'all' ? 'active' : ''}`}
                  onClick={() => { setVisibilityFilter('all'); setPropPage(1); }}
                  style={{ flex: 1, fontSize: '0.85rem', padding: '8px', background: visibilityFilter === 'all' ? 'var(--highlight-bg)' : 'transparent' }}
                >
                  Show All
                </button>
                <button 
                  className={`btn-secondary ${visibilityFilter === 'visible' ? 'active' : ''}`}
                  onClick={() => { setVisibilityFilter('visible'); setPropPage(1); }}
                  style={{ flex: 1, fontSize: '0.85rem', padding: '8px', background: visibilityFilter === 'visible' ? 'var(--highlight-bg)' : 'transparent' }}
                >
                  Visible Only
                </button>
                <button 
                  className={`btn-secondary ${visibilityFilter === 'hidden' ? 'active' : ''}`}
                  onClick={() => { setVisibilityFilter('hidden'); setPropPage(1); }}
                  style={{ flex: 1, fontSize: '0.85rem', padding: '8px', background: visibilityFilter === 'hidden' ? 'var(--highlight-bg)' : 'transparent' }}
                >
                  Hidden Only
                </button>
              </div>

              <div className="bulk-actions" style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <button 
                  className="btn-secondary" 
                  onClick={() => handleBulkVisibility(true)}
                  disabled={visibilityUpdating || filteredProperties.length === 0}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.9rem' }}
                >
                  <CheckSquare size={16} /> Show All Filtered
                </button>
                <button 
                  className="btn-secondary" 
                  onClick={() => handleBulkVisibility(false)}
                  disabled={visibilityUpdating || filteredProperties.length === 0}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.9rem' }}
                >
                  <Square size={16} /> Hide All Filtered
                </button>
              </div>

              <div style={{ marginBottom: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Showing {filteredProperties.length} of {properties.length} properties ({visibleCount} visible)
              </div>

              {hasChanges && (
                <div className="save-actions" style={{ 
                  display: 'flex', 
                  gap: '10px', 
                  marginBottom: '15px', 
                  padding: '12px', 
                  background: 'var(--highlight-bg)', 
                  borderRadius: '8px',
                  border: '1px solid var(--primary-color)'
                }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Unsaved Changes</span>
                    <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>You have pending visibility updates.</span>
                  </div>
                  <button 
                    className="btn-primary" 
                    onClick={handleSaveChanges}
                    disabled={visibilityUpdating}
                    style={{ padding: '6px 15px', fontSize: '0.85rem' }}
                  >
                    {visibilityUpdating ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button 
                    className="btn-secondary" 
                    onClick={handleCancelChanges}
                    disabled={visibilityUpdating}
                    style={{ padding: '6px 15px', fontSize: '0.85rem' }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              <div className="property-visibility-list" style={{ 
                maxHeight: '400px', 
                overflowY: 'auto', 
                border: '1px solid var(--border-color)', 
                borderRadius: '8px',
                background: 'var(--secondary-bg)',
                marginBottom: '10px'
              }}>
                {paginatedProperties.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    {filteredProperties.length === 0 
                      ? `No properties found matching "${searchQuery}"`
                      : "No properties on this page."}
                  </div>
                ) : (
                  paginatedProperties.map(prop => (
                    <div 
                      key={prop.id} 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '10px 15px', 
                        borderBottom: '1px solid var(--border-color)',
                        opacity: prop.is_active === false ? 0.6 : 1
                      }}
                    >
                      <span style={{ fontSize: '0.9rem' }}>{prop.name}</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          onClick={() => handleToggleVisibility(prop.id, false)} // Force to true (show)
                          disabled={visibilityUpdating || prop.is_active !== false}
                          style={{ 
                            padding: '4px 12px',
                            fontSize: '0.75rem',
                            borderRadius: '4px',
                            border: '1px solid #4caf50',
                            background: prop.is_active !== false ? '#4caf50' : 'transparent',
                            color: prop.is_active !== false ? 'white' : '#4caf50',
                            cursor: prop.is_active !== false ? 'default' : 'pointer',
                            opacity: prop.is_active !== false ? 1 : 0.6
                          }}
                        >
                          Show
                        </button>
                        <button 
                          onClick={() => handleToggleVisibility(prop.id, true)} // Force to false (hide)
                          disabled={visibilityUpdating || prop.is_active === false}
                          style={{ 
                            padding: '4px 12px',
                            fontSize: '0.75rem',
                            borderRadius: '4px',
                            border: '1px solid #f44336',
                            background: prop.is_active === false ? '#f44336' : 'transparent',
                            color: prop.is_active === false ? 'white' : '#f44336',
                            cursor: prop.is_active === false ? 'default' : 'pointer',
                            opacity: prop.is_active === false ? 1 : 0.6
                          }}
                        >
                          Hide
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {totalPropPages > 1 && (
                <div className="pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '10px' }}>
                  <button 
                    className="btn-secondary" 
                    onClick={() => setPropPage(p => Math.max(1, p - 1))}
                    disabled={propPage === 1}
                    style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                  >
                    Prev
                  </button>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Page {propPage} of {totalPropPages}
                  </span>
                  <button 
                    className="btn-secondary" 
                    onClick={() => setPropPage(p => Math.min(totalPropPages, p + 1))}
                    disabled={propPage === totalPropPages}
                    style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'export' && (
          <div className="card profile-card">
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
        )}
      </main>
    </div>
  );
}
