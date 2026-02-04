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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Fetch properties with total sentence count
      const propsPromise = supabase
        .from('properties')
        .select('*, sentences(count)')
        .order('name');

      // Fetch user label counts per property
      const labsPromise = supabase
        .from('labels')
        .select('property_id')
        .eq('user_id', user.id);
      
      const [
        { data: props, error: pErr },
        { data: labs, error: lErr }
      ] = await Promise.all([propsPromise, labsPromise]);

      if (pErr) console.error(pErr);
      if (lErr) console.error(lErr);

      const newStats = {};
      const propList = props || [];

      // Initialize with totals
      propList.forEach(p => {
        // sentences is returned as [{ count: N }]
        const total = p.sentences?.[0]?.count || 0;
        newStats[p.id] = { total, labeled: 0 };
      });

      // Aggregate user labels
      (labs || []).forEach(l => {
        if (newStats[l.property_id]) {
          newStats[l.property_id].labeled += 1;
        }
      });

      setStats(newStats);
      setProperties(propList);
      setLoading(false);

      // Auto-select first property with unlabeled sentences
      // Only set if not already selected to avoid jumping around
      if (!selected) {
        const firstIncomplete = propList.find(p => {
          const s = newStats[p.id];
          return s && s.labeled < s.total;
        });

        if (firstIncomplete) {
          setSelected(firstIncomplete.id);
        }
      }
    };

    load();
  }, [user.id]);

  const getProgress = (pid) => {
    const s = stats[pid] || { total: 0, labeled: 0 };
    const pct = s.total > 0 ? Math.round((s.labeled / s.total) * 100) : 0;
    return { ...s, pct };
  };

  const updateProgress = async () => {
    if (!selected) return;
    const { count, error } = await supabase
      .from('labels')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('property_id', selected);
    
    if (!error) {
      setStats(prev => ({
        ...prev,
        [selected]: {
          ...prev[selected],
          labeled: count
        }
      }));
    }
  };

  const selectedProperty = properties.find(p => p.id === selected);

  const handleNextProperty = () => {
    const currentIndex = properties.findIndex(p => p.id === selected);
    if (currentIndex >= 0 && currentIndex < properties.length - 1) {
      const nextProp = properties[currentIndex + 1];
      setSelected(nextProp.id);
      alert(`Moving to next property: ${nextProp.name}`);
    } else {
      alert('No more properties available!');
      setSelected(null);
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
          <label htmlFor="property-select" className="label-heading">Select Property</label>
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
                {properties.map(p => {
                  const { total, labeled, pct } = getProgress(p.id);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} ({labeled}/{total} - {pct}%)
                    </option>
                  );
                })}
              </select>
            )}
          </div>
          
          {selectedProperty && (
            <div className="property-details">
              <div className="property-info">
                <span className="badge domain">{selectedProperty.domain}</span>
                <span className="arrow">→</span>
                <span className="badge range">{selectedProperty.range}</span>
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
