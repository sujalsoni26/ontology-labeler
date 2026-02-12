import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import LabelSentence from './LabelSentence';

const BATCH_SIZE = 10;

export default function Sentences({ propertyId, userId, property, onPropertyFinished, onProgressUpdate }) {
  const [sentences, setSentences] = useState([]);
  const [labeledIds, setLabeledIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentLabel, setCurrentLabel] = useState(null);
  const [sortMode, setSortMode] = useState('unlabeled'); // 'unlabeled', 'least_labeled', or 'all'
  const [totalCount, setTotalCount] = useState(0);
  const [allSentenceIds, setAllSentenceIds] = useState([]);
  
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
        // 1. Fetch total count of sentences for this property
        let countQuery = supabase
          .from('sentences')
          .select('*', { count: 'exact', head: true })
          .eq('property_id', propertyId);
        
        if (sortMode === 'unlabeled') {
          countQuery = countQuery.eq('label_count', 0);
        }

        const { count, error: cErr } = await countQuery;
        
        if (cErr) throw cErr;
        if (mounted) setTotalCount(count || 0);

        // 1.5 Fetch ALL sentence IDs for this property with current sort mode
        let idQuery = supabase
          .from('sentences')
          .select('id')
          .eq('property_id', propertyId);
        
        if (sortMode === 'unlabeled') {
          idQuery = idQuery.eq('label_count', 0);
        }

        if (sortMode === 'least_labeled') {
          idQuery = idQuery
            .order('label_count', { ascending: true, nullsFirst: false })
            .order('id', { ascending: true });
        } else {
          idQuery = idQuery.order('id', { ascending: true });
        }
        
        const { data: idData, error: idErr } = await idQuery;
        if (idErr) throw idErr;
        
        if (mounted) {
            setAllSentenceIds(idData.map(x => x.id));
        }

        // 2. Fetch all my labeled IDs for this property (Lightweight: only IDs)
        const { data: lData, error: lErr } = await supabase
          .from('labels')
          .select('sentence_id')
          .eq('property_id', propertyId)
          .eq('user_id', userId);
        
        if (lErr) throw lErr;
        
        const myLabeledIds = new Set(lData.map(l => l.sentence_id));
        if (mounted) setLabeledIds(myLabeledIds);

        // 3. Fetch first batch
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
    if (isFetching && !isReset) return; // Prevent dupes, but allow reset
    setIsFetching(true);
    
    try {
        let query = supabase
          .from('sentences')
          .select('*')
          .eq('property_id', propertyId);

        if (mode === 'unlabeled') {
          query = query.eq('label_count', 0);
        }

        if (mode === 'least_labeled') {
          query = query
            .order('label_count', { ascending: true, nullsFirst: false })
            .order('id', { ascending: true });
        } else {
          query = query.order('id', { ascending: true });
        }

        query = query.range(startOffset, startOffset + BATCH_SIZE - 1);

        const { data, error } = await query;
        if (error) throw error;

        if (data.length < BATCH_SIZE) {
          setHasMore(false);
        }

        setSentences(prev => {
            if (isReset) return data;
            // Sparse array update
            const next = [...prev];
            data.forEach((item, i) => {
                next[startOffset + i] = item;
            });
            return next;
        });
    } catch (err) {
        console.error("Fetch batch error", err);
    } finally {
        setIsFetching(false);
    }
  };

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
      alert("No more unlabeled sentences found!");
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
      alert("No more unlabeled sentences found!");
  };

  const handleSaved = async (delta) => {
    const currentSentence = sentences[currentIndex];
    if (!currentSentence) return;

    // 1. Update Counts
    let newCount = (currentSentence.label_count || 0);
    if (delta !== 0) {
        newCount = Math.max(0, newCount + delta);
        
        const rpcName = delta > 0 ? 'increment_label_count' : 'decrement_label_count';
        const { error: updateError } = await supabase
          .rpc(rpcName, { sentence_id_input: currentSentence.id });
        
        if (updateError) {
          console.error(`Failed to ${delta > 0 ? 'increment' : 'decrement'} label count via RPC:`, updateError);
          // Fallback to direct update
          const { error: directError } = await supabase
            .from('sentences')
            .update({ label_count: newCount })
            .eq('id', currentSentence.id);
          
          if (directError) {
            console.error("Fallback direct update also failed:", directError);
          }
        }
    }

    // 2. Update Labeled Set
    const newLabeledIds = new Set(labeledIds);
    newLabeledIds.add(currentSentence.id);
    setLabeledIds(newLabeledIds);

    // 3. UI Update
    // Update current sentence object in buffer (sparse array compatible)
    setSentences(prev => {
        const next = [...prev];
        if (next[currentIndex]) {
             next[currentIndex] = { ...next[currentIndex], label_count: newCount };
        }
        return next;
    });
    
    // Advance
    handleNext();
    setCurrentLabel(null);
    if (onProgressUpdate) onProgressUpdate();
  };

  if (error) return <div className="error">{error}</div>;
  
  // Show empty state only if we really have 0 total sentences
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
                <option value="unlabeled">Unlabeled Only</option>
                <option value="least_labeled">Least Labeled</option>
                <option value="all">All Sentences</option>
              </select>
           </div>
         </div>
         <div className="empty-state">No sentences found matching the current mode.</div>
       </div>
     );
   }

  const safeIndex = Math.min(currentIndex, Math.max(0, totalCount - 1));
  const currentSentence = sentences[safeIndex];
  
  // Active label safety check
  const activeLabel = currentLabel && currentLabel.sentence_id === currentSentence?.id ? currentLabel : null;

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
            <option value="unlabeled">Unlabeled Only</option>
            <option value="least_labeled">Least Labeled</option>
            <option value="all">All Sentences</option>
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
              key={`${currentSentence.id}:${activeLabel ? activeLabel.id ?? 'none' : 'none'}`} 
              sentence={currentSentence}
              existingLabel={activeLabel}
              userId={userId}
              propertyId={propertyId}
              property={property}
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