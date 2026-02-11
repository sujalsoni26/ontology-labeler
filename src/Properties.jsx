import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import Sentences from './Sentences';
import UserLabels from './UserLabels';
import Profile from './Profile';
import Admin from './Admin';

export default function Properties({ user, toggleTheme, theme }) {
  const [properties, setProperties] = useState([]);
  const [selected, setSelected] = useState(null);

  const [stats, setStats] = useState({});

  const [loading, setLoading] = useState(true);
  const [hideGloballyLabeled, setHideGloballyLabeled] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Fetch properties with pre-calculated sentence_count
      const propsPromise = supabase
        .from('properties')
        .select('*')
        .order('name');

      // Fetch user label counts per property
      const labsPromise = supabase
        .from('labels')
        .select('property_id')
        .eq('user_id', user.id);
      
      // Fetch global progress (sentences that have at least one label)
      // We can use the 'sentences' table directly since we have label_count there
      const globalProgressPromise = supabase
        .from('sentences')
        .select('property_id, id')
        .gt('label_count', 0);
      
      const [
        { data: props, error: pErr },
        { data: labs, error: lErr },
        { data: globalLabs, error: gErr }
      ] = await Promise.all([propsPromise, labsPromise, globalProgressPromise]);

      if (pErr) console.error(pErr);
      if (lErr) console.error(lErr);
      if (gErr) console.error(gErr);

      const newStats = {};
      const propList = props || [];

      // Initialize stats using the sentence_count from the DB
      propList.forEach(p => {
        newStats[p.id] = { total: p.sentence_count || 0, labeled: 0, globalLabeled: 0 };
      });

      // Aggregate user labels
      (labs || []).forEach(l => {
        if (newStats[l.property_id]) {
          newStats[l.property_id].labeled += 1;
        }
      });

      // Aggregate global labels
      (globalLabs || []).forEach(l => {
        if (newStats[l.property_id]) {
          newStats[l.property_id].globalLabeled += 1;
        }
      });

      setStats(newStats);
      setProperties(propList);
      setLoading(false);

      // Auto-select first property with unlabeled sentences
      if (!selected) {
        const firstIncomplete = propList.find(p => {
          const s = newStats[p.id];
          return s && s.labeled < s.total;
        });

        if (firstIncomplete) {
          setSelected(firstIncomplete.id);
        } else if (propList.length > 0) {
          setSelected(propList[0].id);
        }
      }
    };

    load();
  }, [user.id]);

  const getProgress = (pid) => {
    const s = stats[pid] || { total: 0, labeled: 0, globalLabeled: 0 };
    const pct = s.total > 0 ? Math.round((s.labeled / s.total) * 100) : 0;
    const globalPct = s.total > 0 ? Math.round((s.globalLabeled / s.total) * 100) : 0;
    const isGloballyFinished = s.total > 0 && s.globalLabeled >= s.total;
    const isUserFinished = s.total > 0 && s.labeled >= s.total;
    return { ...s, pct, globalPct, isGloballyFinished, isUserFinished };
  };

  const updateProgress = async () => {
    if (!selected) return;
    
    // Update user stats
    const { count: userCount, error: uErr } = await supabase
      .from('labels')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('property_id', selected);
    
    // Update global stats for this property
    const { count: globalCount, error: gErr } = await supabase
      .from('sentences')
      .select('*', { count: 'exact', head: true })
      .eq('property_id', selected)
      .gt('label_count', 0);

    if (!uErr && !gErr) {
      setStats(prev => ({
        ...prev,
        [selected]: {
          ...prev[selected],
          labeled: userCount,
          globalLabeled: globalCount
        }
      }));
    }
  };

  const sortedAndFilteredProperties = properties
    .filter(p => {
      if (!hideGloballyLabeled) return true;
      const { isGloballyFinished } = getProgress(p.id);
      return !isGloballyFinished;
    })
    .sort((a, b) => {
      const progA = getProgress(a.id);
      const progB = getProgress(b.id);
      
      // If one is finished by user and other isn't, move finished to bottom
      if (progA.isUserFinished && !progB.isUserFinished) return 1;
      if (!progA.isUserFinished && progB.isUserFinished) return -1;
      
      // Otherwise keep original order (by name, as fetched)
      return 0;
    });

  const selectedProperty = properties.find(p => p.id === selected);

  const handleNextProperty = () => {
    const currentIndex = sortedAndFilteredProperties.findIndex(p => p.id === selected);
    if (currentIndex >= 0 && currentIndex < sortedAndFilteredProperties.length - 1) {
      const nextProp = sortedAndFilteredProperties[currentIndex + 1];
      setSelected(nextProp.id);
      alert(`Moving to next property: ${nextProp.name}`);
    } else {
      alert('No more properties available in current view!');
      // Don't deselect, just stay on current or let user pick
    }
  };

  const [view, setView] = useState('labeling'); // 'labeling', 'history', or 'profile'

  if (view === 'history') {
    return <UserLabels userId={user.id} onBack={() => setView('labeling')} />;
  }

  if (view === 'profile') {
    return <Profile user={user} stats={stats} properties={properties} onBack={() => setView('labeling')} />;
  }

  if (view === 'admin') {
    return <Admin user={user} onBack={() => setView('labeling')} />;
  }

  return (
    <div className="container">
      <header className="header">
        <div className="header-content">
          <h1>Ontology Labeler</h1>
          <div className="user-controls">
            <button className="btn-secondary btn-icon-text" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            {user?.email === 'admin@local.auth' && (
              <button className="btn-secondary btn-icon-text" onClick={() => setView('admin')}>
                🛡️ Admin
              </button>
            )}
            <button className="btn-secondary btn-icon-text" onClick={() => setView('history')}>
              📋 My Labels
            </button>
            <button className="btn-secondary btn-icon-text" onClick={() => setView('profile')}>
              👤 Profile
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="card property-selector">
          <div className="property-selector-header">
            <label htmlFor="property-select" className="label-heading">Select Property</label>
            <div className="filter-controls">
              <label className="checkbox-label" title="Hide properties where every sentence has at least one label from any user">
                <input 
                  type="checkbox" 
                  checked={hideGloballyLabeled} 
                  onChange={(e) => setHideGloballyLabeled(e.target.checked)}
                />
                <span>Hide globally labeled</span>
              </label>
            </div>
          </div>
          <div className="select-wrapper">
            {loading ? (
              <div className="loading-dropdown">Loading properties...</div>
            ) : (
              <select
                id="property-select"
                className="property-dropdown"
                value={selected || ''}
                onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">-- Choose a property --</option>
                {sortedAndFilteredProperties.map(p => {
                  const { total, labeled, pct, isUserFinished, isGloballyFinished } = getProgress(p.id);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name + ' '}
                      {isUserFinished ? '✅ ' : ''}
                      {isGloballyFinished ? '🌐 ' : ''} ({labeled}/{total} - {pct}%)
                    </option>
                  );
                })}
              </select>
            )}
          </div>
          
          {selectedProperty && (
            <div className="property-details">
              <div className="property-title-row">
                <h2 className="property-name-display">
                  {selectedProperty.iri ? (
                    <a href={selectedProperty.iri} target="_blank" rel="noopener noreferrer" title="View Property in DBpedia">
                      {selectedProperty.name} 🔗
                    </a>
                  ) : (
                    selectedProperty.name
                  )}
                </h2>
              </div>

              {selectedProperty.description && (
                <div className="property-description-box">
                  <p>{selectedProperty.description}</p>
                </div>
              )}

              <div className="property-info">
                <span className="badge domain">
                  {selectedProperty.domain_link ? (
                    <a href={selectedProperty.domain_link} target="_blank" rel="noopener noreferrer">
                      {selectedProperty.domain}
                    </a>
                  ) : (
                    selectedProperty.domain
                  )}
                </span>
                <span className="arrow">→</span>
                <span className="badge range">
                  {selectedProperty.range_link ? (
                    <a href={selectedProperty.range_link} target="_blank" rel="noopener noreferrer">
                      {selectedProperty.range}
                    </a>
                  ) : (
                    selectedProperty.range
                  )}
                </span>
              </div>
              
              <div className="progress-section">
                <div className="progress-labels">
                  <span className="progress-count">
                    {getProgress(selected).labeled} / {getProgress(selected).total} labeled
                  </span>
                  <span className="progress-pct">{getProgress(selected).pct}%</span>
                </div>
                <div className="progress-bar-track">
                  <div 
                    className="progress-bar-fill" 
                    style={{ width: `${getProgress(selected).pct}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {selected && (
          <Sentences
            propertyId={selected}
            userId={user?.id}
            property={selectedProperty}
            onPropertyFinished={handleNextProperty}
            onProgressUpdate={updateProgress}
          />
        )}
      </main>
    </div>
  );
}
