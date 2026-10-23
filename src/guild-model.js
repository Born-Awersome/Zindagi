import { people } from './data.js';

export function distanceKm(a, b) {
  const radians = value => value * Math.PI / 180;
  const lat = radians(b.latitude - a.latitude), lon = radians(b.longitude - a.longitude);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(lon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export const sampleGuilds = [
  { id: 'focus-club', name: 'The Focus Club', description: 'Deep work, shared goals, and a little friendly competition.', aspect: 'academics', members: ['AM', 'MS'], distance: 1.4 },
  { id: 'stride-squad', name: 'Stride Squad', description: 'Show up for your body and cheer each other on.', aspect: 'fitness', members: ['KR', 'AM'], distance: 3.5 },
  { id: 'makers-circle', name: 'Makers Circle', description: 'Turn ambitious ideas into finished projects, together.', aspect: 'creativity', members: ['MS', 'KR'], distance: 8 },
];
const sampleStats = { AM: {academics:12,career:4,social:3,fitness:3,creativity:2}, MS: {academics:4,career:3,social:2,fitness:2,creativity:10}, KR: {academics:2,career:2,social:3,fitness:10,creativity:1} };
export function guildRanks(guild, state, aspect = 'all') {
  const rows = guild.members.map(id => people.find(p => p.initials === id)).filter(Boolean).map(p => ({...p, you: false, score: aspect === 'all' ? p.points : sampleStats[p.initials][aspect] || 0}));
  if (state.guildIds.includes(guild.id)) rows.push({name: state.name, initials: state.name.slice(0, 2).toUpperCase(), color:'#e5eddc', you:true, score: aspect === 'all' ? Object.values(state.points).reduce((sum,n)=>sum+n,0) : state.points[aspect] || 0});
  return rows.sort((a,b)=> b.score-a.score || a.name.localeCompare(b.name));
}
export function toggleMembership(state, id) {
  state.guildIds = state.guildIds.includes(id) ? state.guildIds.filter(value=>value!==id) : [...state.guildIds, id];
}

