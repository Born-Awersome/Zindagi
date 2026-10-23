import { categories, people } from './data.js';

import { distanceKm, sampleGuilds, guildRanks, toggleMembership } from './guild-model.js';

// Coordinates are deliberately kept out of application state and localStorage.
let position = null, mode = 'off', watchId = null, generation = 0;
let locationError = '', radius = 5, selectedGuild = null, boardAspect = 'all';
let formDraft = { name:'', description:'', aspect:'academics', members:[] };
let refresh = () => {};
export function stopLocation() {
  generation++;
  if (watchId !== null) navigator.geolocation?.clearWatch(watchId);
  watchId = null;
  position = null;
  mode = 'off';
  locationError = '';
}
function trackLocation() {
  stopLocation();
  if (!window.isSecureContext || !navigator.geolocation) {
    locationError = 'Location requires HTTPS or localhost and a browser with location support. You can still explore the demo area.';
    refresh(); return;
  }
  mode = 'loading'; refresh();
  const request = generation;
  watchId = navigator.geolocation.watchPosition(result => {
    if (request !== generation) return;
    const next = { latitude:result.coords.latitude, longitude:result.coords.longitude };
    const changed = !position || distanceKm(position, next) > .1 || mode !== 'device';
    position = next; mode = 'device'; locationError = '';
    if(changed) refresh();
  }, error => {
    if (request !== generation) return;
    stopLocation();
    locationError = error.code === 1 ? 'Location permission was denied. Allow location in your browser settings and try again, or use the demo area.' : error.code === 3 ? 'Location timed out. Try again or explore the demo area.' : 'Your location is unavailable. Try again or explore the demo area.';
    refresh();
  }, {enableHighAccuracy:false, maximumAge:60000, timeout:15000});
}
window.addEventListener('pagehide', stopLocation);
document.addEventListener('visibilitychange',()=>{ if(document.hidden && (mode==='device'||mode==='loading')) {stopLocation();refresh();} });

export function guildView(state, escape) {
  const active = mode === 'demo' || mode === 'device';
  const allGuilds = [...sampleGuilds, ...state.customGuilds];
  const selected = allGuilds.find(g=>g.id===selectedGuild);
  const joined = allGuilds.filter(g=>state.guildIds.includes(g.id));
  const memberOptions = people.map(p=>`<label class="member-option"><input type="checkbox" name="members" value="${p.initials}" ${formDraft.members.includes(p.initials)?'checked':''}>${p.name} <span>Demo</span></label>`).join('');
  const card = g => `<article class="panel guild-card"><div class="guild-card-top"><span class="guild-emblem">⚑</span><span class="pill">${g.distance === undefined?'Your guild':`Demo · ~${g.distance} km`}</span></div><h3>${escape(g.name)}</h3><p class="muted">${escape(g.description)}</p><div class="guild-meta">${categories.find(c=>c.id===g.aspect)?.name || 'All aspects'} · ${g.members.length + Number(state.guildIds.includes(g.id))} members</div><div class="guild-actions"><button class="button ${state.guildIds.includes(g.id)?'light':''}" data-join-guild="${escape(g.id)}">${state.guildIds.includes(g.id)?'Leave guild':'Join guild +'}</button><button class="text-button" data-open-guild="${escape(g.id)}">Leaderboard ›</button></div></article>`;
  return `<section class="panel location-panel"><div><p class="eyebrow">FIND YOUR LOCAL CIRCLE</p><h2>Big goals. Nearby company.</h2><p class="muted">Use your location while this page is open, or explore a demo area. Coordinates stay in memory on this device and are never shared or saved.</p></div><div class="location-controls"><button class="button" id="locate" ${mode==='loading'?'disabled':''}>${mode==='loading'?'Finding your location…':mode==='device'?'Refresh my location':'Use my location'}</button><button class="button light" id="demo-location">Explore demo area</button>${mode!=='off'?'<button class="text-button" id="stop-location">Turn location off</button>':''}</div><p class="location-status" role="status">${locationError || (mode==='device'?'● Location active · updates while this page is visible':mode==='demo'?'◎ Demo area active · no device location used':mode==='loading'?'Waiting for your browser’s location permission…':'Location is off. You choose when to enable it.')}</p></section>
  <div class="guild-notice"><strong>Prototype community</strong> · People, guild locations, and distances below are simulated examples, not actual nearby users. No coordinates or invitations are sent to anyone.</div>
  <div class="section-heading"><div><p class="eyebrow">YOUR NEIGHBOURHOOD, YOUR TEAM</p><h2>People near you</h2></div><label class="radius-label">Search radius<select id="nearby-radius"><option value="1" ${radius===1?'selected':''}>1 km</option><option value="5" ${radius===5?'selected':''}>5 km</option><option value="10" ${radius===10?'selected':''}>10 km</option><option value="25" ${radius===25?'selected':''}>25 km</option></select></label></div>
  ${active?`<div class="people-grid">${people.map((p,i)=>({...p,distance:[.8,2.5,7][i]})).filter(p=>p.distance<=radius).map(p=>`<article class="person"><div class="avatar" style="background:${p.color}">${p.initials}</div><h3>${p.name}</h3><p>${p.role}</p><span class="match">Demo distance · ~${p.distance} km · ${categories.find(c=>c.id===p.category).name}</span><button class="button light connect" data-connect="${p.initials}">${state.connections.includes(p.initials)?'Added to your circle ✓':'Add to my circle +'}</button></article>`).join('')}</div>`:'<div class="empty-state">Enable location or choose the demo area to explore nearby discovery.</div>'}
  <div class="section-heading"><div><p class="eyebrow">FIND YOUR PEOPLE. RAISE THE BAR.</p><h2>Nearby guilds</h2></div><span class="muted">Sample groups</span></div>
  ${active?(sampleGuilds.some(g=>g.distance<=radius)?`<div class="guild-grid">${sampleGuilds.filter(g=>g.distance<=radius).map(card).join('')}</div>`:'<div class="empty-state">No demo guilds within this radius. Try 5 km or create your own below.</div>'):'<div class="empty-state">Nearby guilds appear once you select a location mode. Your memberships stay available below.</div>'}
  <div class="section-heading"><div><p class="eyebrow">YOUR SHARED COMPETITION GROUPS</p><h2>My guilds</h2></div><span class="pill">${joined.length} joined</span></div>
  ${joined.length?`<div class="guild-grid">${joined.map(card).join('')}</div>`:'<div class="empty-state">Join a guild or start one. Completing tasks will grow your score on each guild leaderboard.</div>'}
  ${selected?`<section class="panel guild-board" id="guild-board"><div class="section-heading"><div><p class="eyebrow">GUILD LEADERBOARD · ALL-TIME</p><h2>${escape(selected.name)}</h2></div><button class="text-button" id="close-guild">Close ×</button></div><p class="muted">Member-only ranking using total earned points, including points earned before joining. Demo task points count locally. Equal scores share a rank.</p><div class="filters board-filters">${[{id:'all',name:'All aspects'},...categories].map(c=>`<button class="chip ${boardAspect===c.id?'selected':''}" data-board-aspect="${c.id}" aria-pressed="${boardAspect===c.id}">${c.name}</button>`).join('')}</div>${(()=>{const rows=guildRanks(selected,state,boardAspect);return rows.length?rows.map((p,i)=>`<div class="ranking ${p.you?'you':''}"><span class="rank">${rows.findIndex(row=>row.score===p.score)+1}</span><span class="avatar small" style="background:${p.color}">${escape(p.initials)}</span><strong>${escape(p.name)} <span class="you-label">${p.you?'YOU':'DEMO'}</span></strong><span class="rank-points">${p.score} <small>pts</small></span></div>`).join(''):'<p class="empty-state">No members yet. Join this guild to appear here.</p>';})()}</section>`:''}
  <section class="panel create-guild"><p class="eyebrow">START SOMETHING TOGETHER</p><h2>Create your guild</h2><p class="muted">Give your group a name and a focus. You’ll join automatically. Your guild is saved on this browser.</p><form id="guild-form"><div class="guild-form-grid"><label>Guild name<input name="guildName" required minlength="3" maxlength="40" placeholder="e.g. Campus Achievers" value="${escape(formDraft.name)}"></label><label>Main focus<select name="aspect">${categories.map(c=>`<option value="${c.id}" ${formDraft.aspect===c.id?'selected':''}>${c.name}</option>`).join('')}</select></label></div><label>What are you working towards?<input name="description" maxlength="140" placeholder="Our goals, our pace, our community." value="${escape(formDraft.description)}"></label><fieldset><legend>Add sample members to test group competition (optional)</legend><div class="member-options">${memberOptions}</div></fieldset><button class="button" type="submit">Create guild +</button></form></section>`;
}

export function bindGuilds(state, save, render, toast) {
  refresh = render;
  document.querySelector('#locate')?.addEventListener('click', trackLocation);
  document.querySelector('#demo-location')?.addEventListener('click',()=>{stopLocation();mode='demo';render();});
  document.querySelector('#stop-location')?.addEventListener('click',()=>{stopLocation();render();});
  document.querySelector('#nearby-radius')?.addEventListener('change',e=>{radius=Number(e.target.value);render();});
  document.querySelectorAll('[data-join-guild]').forEach(el=>el.onclick=()=>{toggleMembership(state,el.dataset.joinGuild);save();render();toast('Guild membership updated on this browser.');});
  document.querySelectorAll('[data-open-guild]').forEach(el=>el.onclick=()=>{selectedGuild=el.dataset.openGuild;boardAspect='all';render();document.querySelector('#guild-board').scrollIntoView({block:'start'});});
  document.querySelectorAll('[data-board-aspect]').forEach(el=>el.onclick=()=>{boardAspect=el.dataset.boardAspect;render();document.querySelector('#guild-board').scrollIntoView({block:'start'});});
  document.querySelector('#close-guild')?.addEventListener('click',()=>{selectedGuild=null;render();});
  const form = document.querySelector('#guild-form');
  form?.addEventListener('input',()=>{const data=new FormData(form);formDraft={name:data.get('guildName'),description:data.get('description'),aspect:data.get('aspect'),members:data.getAll('members')};});
  form?.addEventListener('submit',e=>{
    e.preventDefault();
    const data=new FormData(form), name=data.get('guildName').trim();
    if(name.length<3) {toast('Choose a guild name with at least 3 characters.');return;}
    if([...sampleGuilds,...state.customGuilds].some(g=>g.name.toLowerCase()===name.toLowerCase())) {toast('A guild with that name already exists. Choose another name.');return;}
    const guild={id:crypto.randomUUID(),name,description:data.get('description').trim(),aspect:data.get('aspect'),members:data.getAll('members')};
    state.customGuilds.push(guild);state.guildIds.push(guild.id);selectedGuild=guild.id;boardAspect='all';
    formDraft={name:'',description:'',aspect:'academics',members:[]};
    save();render();document.querySelector('#guild-board').scrollIntoView({block:'start'});toast('Your guild is ready. Let’s grow together.');
  });
}
export function resetGuildView() {stopLocation();selectedGuild=null;formDraft={name:'',description:'',aspect:'academics',members:[]};}
