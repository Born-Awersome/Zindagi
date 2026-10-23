import { categories } from './data.js';
export const initialState = () => ({ name: 'Alex', goal: 'A little better, every day.', interests: 'academics', points: Object.fromEntries(categories.map(c => [c.id, 0])), history: [], connections: [], guildIds: [], customGuilds: [], session: null, demo: false });
export function completeSession(state, now = Date.now()) {
  const session = state.session;
  if (!session || session.category === 'cultural' || session.category === 'creativity' || session.mode === 'recording' || session.pausedAt || now < session.endsAt) return false;
  state.points[session.category] += session.points;
  state.history.unshift({ title: session.title, category: session.category, points: session.points, at: now, demo: session.demo });
  state.session = null;
  return true;
}
export function pauseSession(session, now = Date.now()) {
  if (session.pausedAt) { session.endsAt += now - session.pausedAt; session.startedAt += now - session.pausedAt; session.pausedAt = null; }
  else session.pausedAt = now;
}

// Preserve existing local progress when the fifth aspect changes name.
export function migrateLocalState(saved) {
  if (!saved || typeof saved !== 'object' || !saved.points) return initialState();
  const result = {...initialState(), ...saved, points: {...saved.points}};
  const old = Number.isFinite(result.points.creativity) ? result.points.creativity : 0;
  result.points.cultural = (Number.isFinite(result.points.cultural) ? result.points.cultural : 0) + old;
  delete result.points.creativity;
  for (const category of categories) if (!Number.isFinite(result.points[category.id])) result.points[category.id] = 0;
  if (result.interests === 'creativity') result.interests = 'cultural';
  result.history = Array.isArray(saved.history) ? saved.history.map(h => ({...h, category: h.category === 'creativity' ? 'cultural' : h.category})) : [];
  result.customGuilds = Array.isArray(saved.customGuilds) ? saved.customGuilds.map(g => ({...g, aspect: g.aspect === 'creativity' ? 'cultural' : g.aspect})) : [];
  result.connections = Array.isArray(saved.connections) ? saved.connections : [];
  result.guildIds = Array.isArray(saved.guildIds) ? saved.guildIds : [];
  // An old creative timer cannot complete the new recording quest.
  if (result.session?.id === 'create' || ['creativity','cultural'].includes(result.session?.category)) result.session = null;
  return result;
}
export function completeLocalRecording(state, receipt, now = Date.now()) {
  if (state.session || !receipt?.id || !Number.isFinite(receipt.bytes) || receipt.bytes < 1024 || state.history.some(h => h.recordingId === receipt.id)) return false;
  state.points.cultural += 1;
  state.history.unshift({title: 'Showcase your cultural talent', category: 'cultural', points: 1, at: now, demo: true, recordingId: receipt.id, mode: 'recording'});
  return true;
}
