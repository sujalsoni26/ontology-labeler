import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import LabelSentence from './LabelSentence';
import { hasExtraAccess, getSentencesCount } from './modelLabelUtils';

const BATCH_SIZE = 10;

export default function Sentences({ propertyId, userId, user, property, onPropertyFinished, onProgressUpdate }) {
  const [sentences, setSentences] = useState([]);
  const [labeledIds, setLabeledIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentLabel, setCurrentLabel] = useState(null);
  const [currentModelLabel, setCurrentModelLabel] = useState(null);
  const [sortMode, setSortMode] = useState('unlabeled'); // 'unlabeled', 'least_labeled', 'all', or 'model_labeled'
  const [totalCount, setTotalCount] = useState(0);
  const [allSentenceIds, setAllSentenceIds] = useState([]);
  const [labelThreshold, setLabelThreshold] = useState(1);
  const [userHasExtraAccess, setUserHasExtraAccess] = useState(false);
  
  // Pagination state
  const [hasMore, setHasMore] = useState(true);
  const [isFetching, setIsFetching] = useState(false);

  // Initial Load
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      setError(null);
      setSentences([]);
      setCurrentIndex(0);
      setHasMore(true);
      setLabeledIds(new Set());

      try {
        // Check user extra_access
        const hasAccess = await hasExtraAccess(userId);
        if (mounted) {
          setUserHasExtraAccess(hasAccess);
        }

        let thresholdValue = 1;
        try {
          const { data: setting, error: tErr } = await supabase
            .from('app_settings')
            .select('int_value')
            .eq('key', 'label_threshold')
            .maybeSingle();
          if (!tErr && setting && setting.int_value != null) {
            thresholdValue = setting.int_value;
          }
        } catch (tErr) {
          console.error("Error loading label threshold:", tErr);
        }

        if (mounted) {
          setLabelThreshold(thresholdValue);
        }

        // Get total count using RPC for combined counts
        let countValue = 0;
        if (sortMode === 'model_labeled') {
          // Count model_labeled sentences for this property
          const { count, error: cErr } = await supabase
            .from('model_labels')
            .select('*', { count: 'exact', head: true })
            .eq('property_id', propertyId)
            .order('check_count', { ascending: true });
          
          if (cErr) throw cErr;
          countValue = count || 0;
        } else {
          // Use RPC for combined count
          countValue = await getSentencesCount(propertyId, sortMode, thresholdValue);
        }

        if (mounted) setTotalCount(countValue);

        // Get all sentence IDs
        let idData = [];
        if (sortMode === 'model_labeled') {
          // Get model labeled sentences ordered by check_count (least labeled first)
          const { data, error: idErr } = await supabase
            .from('model_labels')
            .select('sentence_id:sentence_id')
            .eq('property_id', propertyId)
            .order('check_count', { ascending: true });
          
          if (idErr) throw idErr;
          idData = data.map(x => ({ id: x.sentence_id }));
        } else {
          // Get regular sentences
          let idQuery = supabase
            .from('sentences')
            .select('id')
            .eq('property_id', propertyId);

          if (sortMode === 'unlabeled') {
            if (thresholdValue != null && thresholdValue >= 1) {
              idQuery = idQuery.lt('label_count', thresholdValue);
            } else {
              idQuery = idQuery.eq('label_count', 0);
            }
          }

          if (sortMode === 'least_labeled') {
            idQuery = idQuery
              .order('label_count', { ascending: true, nullsFirst: false })
              .order('id', { ascending: true });
          } else {
            idQuery = idQuery.order('id', { ascending: true });
          }
          
          const { data: retrievedData, error: idErr } = await idQuery;
          if (idErr) throw idErr;
          idData = retrievedData;
        }
        
        if (mounted) {
            setAllSentenceIds(idData.map(x => x.id));
        }

        // Fetch all my labeled IDs for this property
        const { data: lData, error: lErr } = await supabase
          .from('labels')
          .select('sentence_id')
          .eq('property_id', propertyId)
          .eq('user_id', userId);
        
        if (lErr) throw lErr;
        
        const myLabeledIds = new Set(lData.map(l => l.sentence_id));
        if (mounted) setLabeledIds(myLabeledIds);

        // Fetch first batch
        await fetchBatch(0, myLabeledIds, sortMode, true);
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    init();
    return () => { mounted = false; };
  }, [propertyId, userId, sortMode]);

  const fetchBatch = async (startOffset, excludeSet, mode, isReset = false) => {
    if (isFetching && !isReset) return;
    setIsFetching(true);
    
    try {
      let data = [];
      
      if (mode === 'model_labeled') {
        // Fetch model_labeled sentences
        const { data: modelLabeledData, error: mError } = await supabase
          .from('model_labels')
          .select(`
            id,
            sentence_id,
            sentences(id, text, property_id, label_count),
            label,
            subject_start,
            subject_end,
            object_start,
            object_end,
            model_name,
            confidence,
            check_count
          `)
          .eq('property_id', propertyId)
          .order('check_count', { ascending: true })
          .range(startOffset, startOffset + BATCH_SIZE - 1);

        if (mError) throw mError;

        // Transform to sentences format with model label attached
        // Supabase returns foreign-key joined `sentences` as a plain object, NOT an array
        data = modelLabeledData.map(ml => ({
          ...ml.sentences,
          model_label: {
            id: ml.id,
            sentence_id: ml.sentence_id,
            label: ml.label,
            subject_start: ml.subject_start,
            subject_end: ml.subject_end,
            object_start: ml.object_start,
            object_end: ml.object_end,
            model_name: ml.model_name,
            confidence: ml.confidence,
            check_count: ml.check_count
          }
        }));
      } else {
        // Fetch regular sentences
        let query = supabase
          .from('sentences')
          .select('*')
          .eq('property_id', propertyId);

        if (mode === 'unlabeled') {
          if (labelThreshold != null && labelThreshold >= 1) {
            query = query.lt('label_count', labelThreshold);
          } else {
            query = query.eq('label_count', 0);
          }
        }

        if (mode === 'least_labeled') {
          query = query
            .order('label_count', { ascending: true, nullsFirst: false })
            .order('id', { ascending: true });
        } else {
          query = query.order('id', { ascending: true });
        }
        
        const { data: retrievedData, error: rError } = await query.range(startOffset, startOffset + BATCH_SIZE - 1);
        if (rError) throw rError;
        data = retrievedData || [];
      }

      if (data.length > 0) {
        setSentences(prev => [...prev, ...data]);
      }
      
      if (data.length < BATCH_SIZE) {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Error fetching batch:', err);
    } finally {
      setIsFetching(false);
    }
  };

  // Load Model Label (if in model_labeled mode)
  useEffect(() => {
    const currentSentence = sentences[currentIndex];
    if (!currentSentence) {
      setCurrentModelLabel(null);
      return;
    }

    // If in model_labeled mode, use the pre-fetched model label
    if (sortMode === 'model_labeled') {
      setCurrentModelLabel(currentSentence.model_label || null);
      
      // Still try to load user's confirmation label
      const fetchLabel = async () => {
        const { data } = await supabase
          .from('labels')
          .select('*')
          .eq('sentence_id', currentSentence.id)
          .eq('user_id', userId)
          .maybeSingle(); 
        
        setCurrentLabel(data || null);
      };
      fetchLabel();
      return;
    }

    setCurrentModelLabel(null);

    // For regular modes
    if (!labeledIds.has(currentSentence.id)) {
      setCurrentLabel(null);
      return;
    }

    const fetchLabel = async () => {
      const { data } = await supabase
        .from('labels')
        .select('*')
        .eq('sentence_id', currentSentence.id)
        .eq('user_id', userId)
        .maybeSingle(); 
      
      setCurrentLabel(data || null);
    };
    fetchLabel();
  }, [currentIndex, sentences, labeledIds, userId, sortMode]);

  // Ensure current sentence is loaded
  useEffect(() => {
    if (totalCount > 0 && !sentences[currentIndex] && !isFetching) {
        const batchStart = Math.floor(currentIndex / BATCH_SIZE) * BATCH_SIZE;
        fetchBatch(batchStart, labeledIds, sortMode);
    }
  }, [currentIndex, totalCount, sentences, sortMode, isFetching]);

  // Load Label Logic (Optimized)
  useEffect(() => {
    const currentSentence = sentences[currentIndex];
    if (!currentSentence) {
      setCurrentLabel(null);
      return;
    }

    // Optimization: Only fetch if we think we have a label
    // In 'least_labeled' mode, labeledIds check prevents unnecessary calls
    // In 'all' mode, we might revisit labeled ones
    if (!labeledIds.has(currentSentence.id)) {
      setCurrentLabel(null);
      return;
    }

    const fetchLabel = async () => {
      const { data } = await supabase
        .from('labels')
        .select('*')
        .eq('sentence_id', currentSentence.id)
        .eq('user_id', userId)
        .maybeSingle(); 
      
      setCurrentLabel(data || null);
    };
    fetchLabel();
  }, [currentIndex, sentences, labeledIds, userId]);

  const handleNext = () => {
    const nextIndex = currentIndex + 1;
    // Simple wrap around logic
    if (nextIndex < totalCount) {
        setCurrentIndex(nextIndex);
    } else {
        // Cycle to start
        setCurrentIndex(0);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
    } else {
        // Cycle to last available sentence index
        setCurrentIndex(Math.max(0, totalCount - 1));
    }
  };

  const handleNextUnlabeled = () => {
      // Find next index > currentIndex where id is NOT in labeledIds
      for (let i = currentIndex + 1; i < totalCount; i++) {
          const id = allSentenceIds[i];
          if (id && !labeledIds.has(id)) {
              setCurrentIndex(i);
              return;
          }
      }
      // Wrap around search
      for (let i = 0; i < currentIndex; i++) {
          const id = allSentenceIds[i];
          if (id && !labeledIds.has(id)) {
              setCurrentIndex(i);
              return;
          }
      }
      alert("No more below-threshold sentences found!");
  };

  const handlePrevUnlabeled = () => {
      // Find prev index < currentIndex where id is NOT in labeledIds
      for (let i = currentIndex - 1; i >= 0; i--) {
          const id = allSentenceIds[i];
          if (id && !labeledIds.has(id)) {
              setCurrentIndex(i);
              return;
          }
      }
      // Wrap around search
      for (let i = totalCount - 1; i > currentIndex; i--) {
          const id = allSentenceIds[i];
          if (id && !labeledIds.has(id)) {
              setCurrentIndex(i);
              return;
          }
      }
      alert("No more below-threshold sentences found!");
  };

  const handleSaved = async (delta) => {
    const currentSentence = sentences[currentIndex];
    if (!currentSentence) return;

    let newCount = (currentSentence.label_count || 0);
    if (delta !== 0) {
        newCount = Math.max(0, newCount + delta);
        
        const rpcName = delta > 0 ? 'increment_label_count' : 'decrement_label_count';
        const { error: updateError } = await supabase
          .rpc(rpcName, { sentence_id_input: currentSentence.id });
        
        if (updateError) {
          console.error(`Failed to ${delta > 0 ? 'increment' : 'decrement'} label count via RPC:`, updateError);
          const { error: directError } = await supabase
            .from('sentences')
            .update({ label_count: newCount })
            .eq('id', currentSentence.id);
          
          if (directError) {
            console.error("Fallback direct update also failed:", directError);
          }
        }
    }

    const newLabeledIds = new Set(labeledIds);
    newLabeledIds.add(currentSentence.id);
    setLabeledIds(newLabeledIds);

    setSentences(prev => {
        const next = [...prev];
        if (next[currentIndex]) {
             next[currentIndex] = { ...next[currentIndex], label_count: newCount };
        }
        return next;
    });
    
    handleNext();
    setCurrentLabel(null);
    if (onProgressUpdate) onProgressUpdate();
  };

  if (error) return <div className="error">{error}</div>;
  
  if (totalCount === 0) {
     return (
       <div className="labeling-session">
         <div className="toolbar">
           <div className="filter-control">
             <span style={{ marginRight: '8px', fontWeight: 500, whiteSpace: 'nowrap' }}>Mode:</span>
             <select 
                value={sortMode} 
                onChange={e => setSortMode(e.target.value)}
                className="filter-select"
              >
                <option value="unlabeled">Below Threshold</option>
                <option value="least_labeled">Least Labeled</option>
                <option value="all">All Sentences</option>
                {userHasExtraAccess && <option value="model_labeled">Model-Labeled</option>}
              </select>
           </div>
         </div>
         <div className="empty-state">No sentences found matching the current mode.</div>
       </div>
     );
   }

  const safeIndex = Math.min(currentIndex, Math.max(0, totalCount - 1));
  const currentSentence = sentences[safeIndex];
  
  const activeLabel = currentLabel && currentLabel.sentence_id === currentSentence?.id ? currentLabel : null;
  // Must compare sentence_id (not the model_labels row id) to match the current sentence
  const activeModelLabel = currentModelLabel?.sentence_id === currentSentence?.id ? currentModelLabel : null;

  return (
    <div className="labeling-session">
      <div className="toolbar">
        <div className="filter-control">
          <span style={{ marginRight: '8px', fontWeight: 500, whiteSpace: 'nowrap' }}>Mode:</span>
          <select 
            value={sortMode} 
            onChange={e => setSortMode(e.target.value)}
            className="filter-select"
          >
            <option value="unlabeled">Below Threshold</option>
            <option value="least_labeled">Least Labeled</option>
            <option value="all">All Sentences</option>
            {userHasExtraAccess && <option value="model_labeled">Model-Labeled</option>}
          </select>
        </div>
        <div className="progress-info">
            <span>
                {currentIndex + 1} / {totalCount}
            </span>
        </div>
      </div>
      
      {currentSentence ? (
        <div className="sentence-wrapper">
          <button 
            className="nav-arrow left" 
            onClick={handlePrev} 
            title="Previous Sentence"
          >
            &#10094;
          </button>
          
          <div className="card sentence-card">
            <LabelSentence
              key={`${currentSentence.id}:${activeLabel?.id ?? 'none'}:${activeModelLabel?.id ?? 'none'}`} 
              sentence={currentSentence}
              existingLabel={activeLabel}
              modelLabel={activeModelLabel}
              userId={userId}
              propertyId={propertyId}
              property={property}
              isModelLabelMode={sortMode === 'model_labeled'}
              onSaved={handleSaved}
              onNextUnlabeled={handleNextUnlabeled}
              onPrevUnlabeled={handlePrevUnlabeled}
            />
            
            <div className="sentence-meta">
              Labels on this sentence: <strong>{currentSentence.label_count || 0}</strong>
            </div>
          </div>

          <button 
            className="nav-arrow right" 
            onClick={handleNext} 
            title="Next Sentence"
          >
            &#10095;
          </button>
        </div>
      ) : (
        <div className="empty-state">
           Loading sentence {currentIndex + 1}...
        </div>
      )}
    </div>
  );
}
