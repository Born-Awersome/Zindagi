import { LOCATION_TTL_MS } from './proximity-policy.js';
export function locationPresentation(state,now=Date.now()){
 const fresh=!!state.enabled&&!!state.sharing&&state.expiresAt>now;
 const age=fresh?Math.max(0,Math.floor((now-(state.expiresAt-LOCATION_TTL_MS))/1000)):null;
 const remaining=state.sessionEndsAt?Math.max(0,Math.ceil((state.sessionEndsAt-now)/1000)):null;
 return {label:!state.enabled?'Off':state.phase==='paused'?'Paused':state.phase==='retrying'?'Retrying':fresh?'Sharing':'Finding GPS',fresh,
 accuracy:fresh&&Number.isFinite(state.accuracy)?`±${Math.ceil(state.accuracy)} m`:'Waiting for GPS',
 updated:age===null?'No fresh reading':age<2?'Just now':`${age}s ago`,
 readiness:!fresh?'Waiting for a fresh fix':state.accuracy<=10?'Your GPS is ready':'Needs better accuracy',
 duration:remaining===null?'While the app is open':`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')} remaining`};
}
