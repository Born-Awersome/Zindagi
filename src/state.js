import { categories } from './data.js';
export const initialState = () => ({ name: 'Alex', goal: 'A little better, every day.', interests: 'academics', points: Object.fromEntries(categories.map(c => [c.id, 0])), history: [], connections: [], guildIds: [], customGuilds: [], session: null, demo: false });
export function completeSession(state, now = Date.now()) {
  const session = state.session;
  if (!session || session.pausedAt || now < session.endsAt) return false;
  state.points[session.category] += session.points;
  state.history.unshift({ title: session.title, category: session.category, points: session.points, at: now, demo: session.demo });
  state.session = null;
  return true;
}
export function pauseSession(session, now = Date.now()) {
  if (session.pausedAt) { session.endsAt += now - session.pausedAt; session.startedAt += now - session.pausedAt; session.pausedAt = null; }
  else session.pausedAt = now;
}
