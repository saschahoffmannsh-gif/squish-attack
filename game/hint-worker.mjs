// Worker für die Hinweis-Suche: hält den Hauptthread (Animationen) frei.
import { findHint } from './hint-solver.mjs?v=launch-15';
self.onmessage = event => {
  const { id, state, options } = event.data || {};
  let result;
  try { result = findHint(state, options || {}); } catch (error) { result = { found: false, reason: 'error', message: String(error?.message || error) }; }
  self.postMessage({ id, result });
};
