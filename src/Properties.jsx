import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { CheckCircle2, Hexagon, Dices } from 'lucide-react';
import Sentences from './Sentences';
import UserLabels from './UserLabels';
import Profile from './Profile';
import Admin from './Admin';

export default function Properties({ user, view, setView, theme }) {
  const [properties, setProperties] = useState([]);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [hideGloballyLabeled, setHideGloballyLabeled] = useState(true);
  const [sortBy, setSortBy] = useState('completion'); // 'alphabetical', 'completion'

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const propsPromise = supabase
        .from('properties')
        .select('*')
        .order('name');

      const labsPromise = supabase
        .from('labels')
        .select('property_id')
        .eq('user_id', user.id);
      
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

      propList.forEach(p => {
        newStats[p.id] = { total: p.sentence_count || 0, labeled: 0, globalLabeled: 0 };
      });

      (labs || []).forEach(l => {
        if (newStats[l.property_id]) {
          newStats[l.property_id].labeled += 1;
        }
      });

      (globalLabs || []).forEach(l => {
        if (newStats[l.property_id]) {
          newStats[l.property_id].globalLabeled += 1;
        }
      });

      setStats(newStats);
      setProperties(propList);
      setLoading(false);
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
    
    const { count: userCount, error: uErr } = await supabase
      .from('labels')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('property_id', selected);
    
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
      if (sortBy === 'completion') {
        const progA = getProgress(a.id);
        const progB = getProgress(b.id);
        if (progA.globalPct !== progB.globalPct) {
          return progB.globalPct - progA.globalPct;
        }
        return a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });

  const selectedProperty = properties.find(p => p.id === selected);

  const handleNextProperty = () => {
    const currentIndex = sortedAndFilteredProperties.findIndex(p => p.id === selected);
    if (currentIndex >= 0 && currentIndex < sortedAndFilteredProperties.length - 1) {
      const nextProp = sortedAndFilteredProperties[currentIndex + 1];
      setSelected(nextProp.id);
    }
  };

  const handleRandomProperty = () => {
    if (properties.length === 0) return;
    const randomIndex = Math.floor(Math.random() * properties.length);
    const randomProp = properties[randomIndex];
    setSelected(randomProp.id);
  };

  useEffect(() => {
    if (!loading && !selected && sortedAndFilteredProperties.length > 0) {
      setSelected(sortedAndFilteredProperties[0].id);
    }
  }, [loading, selected, sortedAndFilteredProperties]);

  if (view === 'history') {
    return <UserLabels userId={user.id} />;
  }

  if (view === 'profile') {
    return <Profile user={user} stats={stats} properties={properties} />;
  }

  if (view === 'admin') {
    return <Admin user={user} />;
  }

  return (
    <div className="container">
      <header className="header main-header">
        <div className="header-content" style={{ paddingLeft: '20px' }}>
          <h1>Ontology Labeler</h1>
        </div>
      </header>

      <main className="main-content">
        <div className="card property-selector">
          <div className="property-selector-header">
            <label htmlFor="property-select" className="label-heading">Select Property</label>
            <div className="filter-controls">
              <div className="sort-control">
                <label htmlFor="sort-select">Sort:</label>
                <select 
                  id="sort-select" 
                  className="small-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="alphabetical">A-Z</option>
                  <option value="completion">Completion</option>
                </select>
              </div>
              <div className="switch-control">
                <span className="switch-label">Hide labeled properties</span>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={hideGloballyLabeled} 
                    onChange={(e) => setHideGloballyLabeled(e.target.checked)}
                  />
                  <span className="slider round"></span>
                </label>
              </div>
            </div>
          </div>

          <div className="property-selection-row">
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
                    const { total, globalLabeled, globalPct, isUserFinished, isGloballyFinished } = getProgress(p.id);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} {isUserFinished ? '✓' : ''} {isGloballyFinished ? '⬡' : ''} ({globalLabeled}/{total} - {globalPct}%)
                      </option>
                    );
                  })}
                </select>
              )}
            </div>
            <button 
              className="btn-secondary random-btn" 
              onClick={handleRandomProperty}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Dices size={18} />
              <span>Random</span>
            </button>
          </div>
          
          {selectedProperty && (
            <div className="property-details">
              <div className="property-title-row">
                <h2 className="property-name-display" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                  {getProgress(selected).isUserFinished && <CheckCircle2 size={24} color="#10b981" title="You finished this property" />}
                  {getProgress(selected).isGloballyFinished && <Hexagon size={24} color="#646cff" title="Globally finished" />}
                  {selectedProperty.iri ? (
                    <a href={selectedProperty.iri} target="_blank" rel="noopener noreferrer" title="View Property in DBpedia">
                      {selectedProperty.name} ↗
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
                    {getProgress(selected).globalLabeled} / {getProgress(selected).total} (Global)
                  </span>
                  <span className="progress-pct">{getProgress(selected).globalPct}%</span>
                </div>
                <div className="progress-bar-track">
                  <div 
                    className="progress-bar-fill" 
                    style={{ width: `${getProgress(selected).globalPct}%` }}
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
