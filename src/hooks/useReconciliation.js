import { useCallback, useEffect, useRef, useState } from 'react';
import {
  reconcileOnLaunch, getSuggestions, acceptSuggestion, keepSeparate,
  undoMergeAndKeepSeparate
} from '../services/exerciseReconcile.js';

// The app's view of exercise reconciliation.
//
// Runs the version-gated launch pass once, holds the outstanding Tier-2
// suggestions (which Today renders as a card), and exposes the two answers a
// suggestion can be given. All of it is local — nothing in here waits on a
// connection, and a failure leaves the app exactly as it was.
export function useReconciliation({ ready, onMerged, onRefresh }) {
  const [suggestions, setSuggestions] = useState([]);
  const ran = useRef(false);

  // Held in refs so the launch effect depends only on `ready`. Without this the
  // pass would re-run every time a callback identity changed.
  const onMergedRef = useRef(onMerged);
  onMergedRef.current = onMerged;
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const undoRef = useRef(null);

  useEffect(() => {
    if (!ready || ran.current) return;
    ran.current = true;
    (async () => {
      const res = await reconcileOnLaunch();
      setSuggestions(await getSuggestions());
      const merged = res?.custom?.merged || [];
      const deduped = res?.dedupe?.applied || 0;
      if (merged.length || deduped) {
        // The exercise list and every workout projection changed, so the app
        // has to re-read before anything renders the old identities.
        await onRefreshRef.current?.();
        // The undo is handed to the caller rather than the caller reaching back
        // into this hook's return value, which it does not have yet.
        if (merged.length) onMergedRef.current?.(merged, { undoMerge: undoRef.current });
      }
    })();
  }, [ready]);

  const reload = useCallback(async () => {
    setSuggestions(await getSuggestions());
  }, []);

  const accept = useCallback(async (customId, libraryId) => {
    await acceptSuggestion(customId, libraryId);
    await onRefreshRef.current?.();
    await reload();
  }, [reload]);

  const separate = useCallback(async (customId, libraryId) => {
    await keepSeparate(customId, libraryId);
    await reload();
  }, [reload]);

  const undo = useCallback(async (customId) => {
    await undoMergeAndKeepSeparate(customId);
    await onRefreshRef.current?.();
    await reload();
  }, [reload]);
  undoRef.current = undo;

  return { suggestions, acceptSuggestion: accept, keepSeparate: separate, undoMerge: undo, reload };
}
