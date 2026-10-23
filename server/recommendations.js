import { categories, tasks } from '../src/data.js';
export function distanceKm(a,b) {
  const rad=x=>x*Math.PI/180;
  const h=Math.sin(rad(b.latitude-a.latitude)/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(rad(b.longitude-a.longitude)/2)**2;
  return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
const vector = u => categories.map(c=>Math.log1p(u.points?.[c.id]||0));
export function cosine(a,b) { const dot=a.reduce((s,x,i)=>s+x*b[i],0), norm=Math.hypot(...a)*Math.hypot(...b);return norm?dot/norm:0; }
const words = s => new Set((s||'').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.filter(w=>!['the','and','for','with','that','this'].includes(w))||[]);
const overlap = (a,b) => {const x=words(a),y=words(b);return x.size&&y.size?[...x].filter(w=>y.has(w)).length/new Set([...x,...y]).size:0;};
export function rankPeople(viewer,candidates,{nearby=false,radius=10,now=Date.now(),limit=12}={}) {
  const scored=candidates.filter(p=>p.id!==viewer.id&&p.discoverable).map(p=>{
    const same=viewer.interests===p.interests, similarity=cosine(vector(viewer),vector(p));
    const goals=overlap(viewer.goal,p.goal);
    const distance=viewer.location&&p.location?distanceKm(viewer.location,p.location):null;
    const geo=distance===null?0:Math.exp(-distance/10);
    const recent=Math.exp(-Math.max(0,now-p.updatedAt)/(30*86400000));
    // Missing signals are omitted, rather than treating new users as poor matches.
    const signals=[[same?1:0,.35],[goals,.2],[recent,.1]];
    if(Math.hypot(...vector(viewer))&&Math.hypot(...vector(p)))signals.push([similarity,.25]);
    if(distance!==null)signals.push([geo,.1]);
    const score=signals.reduce((s,[v,w])=>s+v*w,0)/signals.reduce((s,[,w])=>s+w,0);
    const reasons=[];if(same)reasons.push(`You both focus on ${viewer.interests}`);if(goals>0)reasons.push('Your goals share common themes');if(similarity>.7)reasons.push('Similar balance across life aspects');if(distance!==null)reasons.push('In your approximate area');if(!reasons.length)reasons.push('Explore a different focus together');
    return {...p,score,distance,reasons};
  }).filter(p=>!nearby||(p.distance!==null&&p.distance<=radius)).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  // Greedy diversity reranking prevents a page made entirely of one interest.
  const selected=[];
  while(scored.length&&selected.length<limit){let best=0;const utility=p=>p.score-.08*selected.filter(x=>x.interests===p.interests).length;for(let i=1;i<scored.length;i++)if(utility(scored[i])>utility(scored[best]))best=i;selected.push(scored.splice(best,1)[0]);}
  return selected;
}
export function rankTasks(user) {
  const max=Math.max(1,...Object.values(user.points));
  return tasks.map(t=>({...t,recommendationScore:(t.category===user.interests? .65:0)+.35*(1-(user.points[t.category]||0)/max),reason:t.category===user.interests?'Matches your current focus':'Build balance in this aspect'})).sort((a,b)=>b.recommendationScore-a.recommendationScore);
}
