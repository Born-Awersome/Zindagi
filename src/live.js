import { configureCommunity, communityPage, updateCommunity, bindCommunity, resetCommunity, showCommunityRequests } from './community.js';
import { createLocationSharing } from './location-sharing.js';
import { socialButtons, connectStatus, bindSocial } from './social.js';
import { startLoading } from './interface.js';
import { guildQuests, bindGuildQuests } from './guild-quests.js';
import { categories } from './data.js';
export const live={user:null,notifications:{items:[],unread:0},conversations:[],social:{links:[],presence:{sharing:false}},people:[],tasks:[],guilds:[],leaderboard:[],guildBoard:[],guildTasks:{},selected:null,aspect:'all',radius:10,nearby:false,locationMessage:'Location sharing is off.',nearbyGuildIds:[],loading:false,error:''};
let hooks={};
let locationState={enabled:false,phase:'off',sharing:false};
const locationSharing=createLocationSharing({geo:navigator.geolocation,send:body=>api('/location','PUT',body,{silent:true,signal:AbortSignal.timeout(12000)}),remove:()=>live.user?api('/location','DELETE',undefined,{silent:true,signal:AbortSignal.timeout(12000)}):Promise.resolve(),onChange:state=>{
 const becameAvailable=!live.nearby&&state.sharing;locationState=state;live.nearby=state.sharing;live.loading=state.phase==='acquiring';live.locationMessage=state.message;if(!state.sharing)live.nearbyGuildIds=[];updateLocationStatus();
 if(becameAvailable)refreshLive().then(()=>{if(locationState.enabled)updateSocialDOM();});
 if(live.user&&!document.hidden)syncSocial();
}});
let guildDraft={name:'',description:'',aspect:'academics'};
export function configureLive(callbacks){hooks=callbacks;configureCommunity({api,action,check:syncSocial,bindSocial:bindSocialControls,updateRequestStatus,});}
const locationPreference=id=>'zindagi-location-'+id;
let restoredLocationUser=null;
async function restoreLocationPreference(id){
 if(restoredLocationUser===id)return;restoredLocationUser=id;
 try{if(localStorage.getItem(locationPreference(id))!=='on')return;const permission=await navigator.permissions.query({name:'geolocation'});if(live.user?.id!==id)return;if(permission.state==='granted')locationSharing.start();else {live.locationMessage='Allow location from My profile to resume sharing.';updateLocationStatus();}}catch{/* Devices without Permissions API require the Profile button. */}
}
function communityModel(){return {user:live.user,social:live.social,notifications:live.notifications,conversations:live.conversations,recommendations:personCards(escapeSocial)};}

export async function api(path,method='GET',body,{silent=false,signal}={}){
  const finish=silent?()=>{}:startLoading();try {
  const res=await fetch(`/api${path}`,{method,headers:{'Content-Type':'application/json','X-Zindagi':'1'},credentials:'same-origin',signal,...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await res.json().catch(()=>({error:'The server returned an unexpected response.'}));
  if(!res.ok)throw Object.assign(new Error(data.error||'Request failed.'),{status:res.status});return data;
  }finally{finish();}
}
export function acceptAccount(data,authenticate=false){if(!authenticate&&live.user?.id!==data.id)return;live.user=data;hooks.accept(data);if(authenticate)restoreLocationPreference(data.id);}
export async function refreshLive(){
  if(!live.user)return;
  const id=live.user.id;
  const nearby=live.nearby?`?nearby=true&radius=${live.radius}`:'';
  try{
    const [recommendations,guilds,leaderboard,nearbyGuilds,social,notifications,conversations]=await Promise.all([api(`/recommendations${nearby}`).catch(error=>{if(error.status===409&&nearby)return api('/recommendations');throw error;}),api('/guilds'),api('/leaderboard'),live.nearby?api(`/guilds${nearby}`).catch(error=>{if(error.status===409)return [];throw error;}):Promise.resolve([]),api('/social'),api('/notifications'),api('/conversations')]);
    if(live.user?.id!==id)return;
    live.social=social;live.notifications=notifications;live.conversations=conversations;live.nearbyGuildIds=nearbyGuilds.map(g=>g.id);live.people=recommendations.people;live.tasks=recommendations.tasks;live.guilds=guilds;live.leaderboard=leaderboard;live.error='';
    if(live.selected&&guilds.some(g=>g.id===live.selected&&g.joined)){const selected=live.selected;const [board,tasks]=await Promise.all([api(`/guilds/${selected}/leaderboard?aspect=${live.aspect}`),api(`/guilds/${selected}/tasks`)]);if(live.user?.id!==id||live.selected!==selected)return;live.guildBoard=board;live.guildTasks=tasks;}else {live.selected=null;live.guildBoard=[];}
  }catch(error){live.error=error.message;live.people=[];}
}
export async function action(fn){try{await fn();}catch(error){hooks.toast(error.message);}}
export function authDialog(){return `<dialog id="auth-dialog"><h2>Your next chapter starts here.</h2><p>Create an account to save progress across devices, discover people, and compete in shared guilds.</p><form id="auth-form"><label>Action<select name="mode" id="auth-mode"><option value="login">Sign in</option><option value="register">Create account</option></select></label><label id="register-name" hidden>Display name<input name="name" maxlength="32" autocomplete="nickname"></label><label>Username<input name="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_]+" autocomplete="username"></label><label>Password<input name="password" type="password" required minlength="10" maxlength="128" autocomplete="current-password"></label><p id="auth-error" role="alert"></p><button class="button" type="submit">Continue</button><button class="text-button" id="auth-close" type="button">Keep exploring the demo</button></form></dialog>`;}
export function bindAuth(){
  document.querySelectorAll('[data-social-signin]').forEach(b=>b.onclick=()=>document.querySelector('#auth-dialog').showModal());
  document.querySelector('#account-button')?.addEventListener('click',()=>live.user?action(async()=>{await disableLiveLocation(false);try{await api('/auth/logout','POST',{});}catch(error){if(error.status!==401)throw error;}live.user=null;restoredLocationUser=null;resetCommunity();live.notifications={items:[],unread:0};live.conversations=[];live.social={links:[],presence:{sharing:false}};live.people=[];live.guilds=[];live.selected=null;hooks.logout();}):document.querySelector('#auth-dialog').showModal());
  document.querySelector('#auth-close')?.addEventListener('click',()=>document.querySelector('#auth-dialog').close());
  document.querySelector('#auth-mode')?.addEventListener('change',e=>{const register=e.target.value==='register';document.querySelector('#register-name').hidden=!register;const input=document.querySelector('#auth-form [name="name"]');input.required=register;document.querySelector('#auth-form [name="password"]').autocomplete=register?'new-password':'current-password';});
  document.querySelector('#auth-form')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.target,data=Object.fromEntries(new FormData(form)),button=form.querySelector('button[type="submit"]');button.disabled=true;try{acceptAccount(await api(`/auth/${data.mode}`,'POST',data),true);await refreshLive();hooks.render();hooks.toast('Signed in. Account progress is saved on the server.');}catch(error){document.querySelector('#auth-error').textContent=error.message;button.disabled=false;}});
}
function personCards(escape){return live.people.length?`<div class="people-grid">${live.people.map(p=>`<article class="person"><div class="avatar">${escape(p.name.slice(0,2).toUpperCase())}</div><h3>${escape(p.name)}</h3><p>${escape(p.goal||'Growing one challenge at a time.')}</p><span class="match">${p.reasons.map(escape).join(' · ')}${p.distanceLabel?` · ${escape(p.distanceLabel)}`:''}</span>${socialButtons(p.id,live.social)}<button class="text-button" data-block="${p.id}">Hide this person</button></article>`).join('')}</div>`:'<div class="empty-state">No matches yet. Invite friends to create accounts and enable discovery in their profiles. Nearby results require both people to share their location.</div>';}
export function liveCommunity(escape,full=false){if(full)return communityPage(communityModel());return `<div class="section-heading"><div><p class="eyebrow">BETTER TOGETHER</p><h2>People to grow with</h2></div><button class="text-button" data-page="Community">Visit Community →</button></div>${personCards(escape)}`;}
export function boardView(rows,escape){return rows.length?rows.map(p=>`<div class="ranking ${p.id===live.user.id?'you':''}"><span class="rank">${p.rank}</span><span class="avatar small">${escape(p.name.slice(0,2).toUpperCase())}</span><strong>${escape(p.name)} ${p.id===live.user.id?'<span class="you-label">YOU</span>':''}</strong><span class="rank-points">${p.score} <small>pts</small></span></div>`).join(''):'<p class="empty-state">No scores to show yet.</p>';}
export function liveLeaderboard(escape){return `<section class="panel leaderboard"><div class="section-heading"><div><p class="eyebrow">SHARED PROGRESS</p><h2>Community leaderboard</h2></div><button class="text-button" id="refresh-live">Refresh ›</button></div><p class="muted">All-time server-awarded points. Only discoverable profiles and your own profile appear here. Practice points never count.</p>${live.error?`<p role="alert">${escape(live.error)}</p>`:''}${boardView(live.leaderboard,escape)}</section>`;}
export function liveGuildView(escape){
  const card=g=>`<article class="panel guild-card"><div class="guild-card-top"><span class="guild-emblem">⚑</span><span class="pill">${g.memberCount} members${live.nearbyGuildIds.includes(g.id)?' · Nearby members':''}</span></div><h3>${escape(g.name)}</h3><p class="muted">${escape(g.description)}</p><div class="guild-meta">${escape(g.aspect)} · Leader: ${escape(g.leaderName||'Guild founder')}${g.isLeader?' (you)':''} · ${g.joined?'Your guild':'Open to join'}</div><div class="guild-actions"><button class="button ${g.joined?'light':''}" data-live-join="${g.id}">${g.joined?'Leave guild':'Join guild +'}</button>${g.joined?`<button class="text-button" data-live-board="${g.id}">Tasks & leaderboard ›</button>`:''}</div></article>`;
  const selected=live.guilds.find(g=>g.id===live.selected);
  return `<div class="section-heading"><h2>People near you</h2><label class="radius-label">Radius<select id="live-radius">${[5,10,25,50].map(r=>`<option value="${r}" ${r===live.radius?'selected':''}>${r} km</option>`).join('')}</select></label></div>${live.nearby?personCards(escape):'<div class="empty-state">Nearby discovery uses your location preference in My profile. Your discovery setting controls whether others can find you.</div>'}${live.error?`<p class="error-notice">${escape(live.error)}</p>`:''}<div class="section-heading"><div><p class="eyebrow">YOUR SHARED COMPETITION GROUPS</p><h2>Discover guilds</h2></div><button class="text-button" id="refresh-live">Refresh ›</button></div><p class="muted recommendation-note">Guilds with nearby members and a matching focus are listed first. Joining shares your display name and scores with other members.</p><div class="guild-grid">${[...live.guilds].sort((a,b)=>(Number(live.nearbyGuildIds.includes(b.id))*2+Number(b.aspect===live.user.interests))-(Number(live.nearbyGuildIds.includes(a.id))*2+Number(a.aspect===live.user.interests))).map(card).join('')||'<div class="empty-state">No guilds yet. Start your own below.</div>'}</div>${selected?`<section class="panel guild-board" id="guild-board"><div class="section-heading"><h2>${escape(selected.name)}</h2><span class="pill">All-time</span></div><p class="muted">Only members of this guild. Your all-time aspect points plus approved rewards from this guild. Custom guild rewards never change the global leaderboard. Equal scores share a rank.</p><div class="filters board-filters">${[{id:'all',name:'All aspects'},...categories].map(c=>`<button class="chip ${c.id===live.aspect?'selected':''}" data-live-aspect="${c.id}">${c.name}</button>`).join('')}</div>${boardView(live.guildBoard,escape)}</section>${guildQuests(live.guildTasks,escape)}`:''}<section class="panel create-guild"><p class="eyebrow">START YOUR LOCAL COMMUNITY</p><h2>Create a guild</h2><form id="live-guild-form"><label>Guild name<input name="name" required minlength="3" maxlength="40" value="${escape(guildDraft.name)}"></label><label>Description<input name="description" maxlength="140" value="${escape(guildDraft.description)}"></label><label>Main focus<select name="aspect">${categories.map(c=>`<option value="${c.id}" ${guildDraft.aspect===c.id?'selected':''}>${c.name}</option>`).join('')}</select></label><button class="button">Create shared guild +</button></form></section>`;
}
export function disableLiveLocation(clearPreference=true){if(clearPreference&&live.user)try{localStorage.removeItem(locationPreference(live.user.id));}catch{}return locationSharing.stop();}
export function locationPanel(escape){return `<section class="panel location-panel" id="profile-location"><div><p class="eyebrow">MEET NEARBY. CONNECT BY CHOICE.</p><h2>Precise location</h2><p class="muted">One setting for nearby discovery and Connect across the app. Your choice is saved for this account on this device. Your precise coordinates and GPS accuracy go to this server, stay in memory for at most 30 seconds, and are never shown to other people. Sharing stays on as you move between tabs. It pauses when the app is hidden and resumes when you return. Sign-out stops tracking; Stop sharing also clears your saved preference. Temporary GPS or network failures retry automatically.</p><p class="fine-print">Choose Precise location in your phone’s permission settings. The app requests high accuracy but cannot override your device settings. GPS may be too inaccurate indoors for the 5–40 metre check.</p></div><div class="location-controls"><button class="button" id="live-locate" >${locationState.enabled?'Retry GPS now':'Enable precise location'}</button><button class="button light" id="live-stop-location">Stop sharing</button></div><p class="location-status" role="status">${escape(live.locationMessage)}</p></section>`;}
function updateLocationStatus(){const button=document.querySelector('#live-locate');if(button){button.disabled=false;button.textContent=locationState.enabled?'Retry GPS now':'Enable precise location';}document.querySelectorAll('.location-status').forEach(el=>el.textContent=live.locationMessage);}
let syncingSocial=null;
async function syncSocial(report=false){
 if(!live.user||document.hidden)return;const id=live.user.id;
 if(syncingSocial){await syncingSocial;if(report)await syncSocial(true);return;}
 syncingSocial=(async()=>{try{
  const [social,notifications,conversations]=await Promise.all(['/social','/notifications','/conversations'].map(path=>api(path,'GET',undefined,{silent:true,signal:AbortSignal.timeout(12000)})));if(live.user?.id!==id)return;live.social=social;live.notifications=notifications;live.conversations=conversations;await updateSocialDOM();
  const status=document.querySelector('#community-sync');if(status)status.textContent=report?'Requests checked just now.':'Updates are live while this page is visible.';
 }catch(error){if(live.user?.id!==id)return;const status=document.querySelector('#community-sync');if(status)status.textContent='Could not refresh requests. Check your connection; we’ll retry automatically.';if(report)hooks.toast(error.message);}finally{syncingSocial=null;}})();
 await syncingSocial;
}
function updateRequestStatus(){
 for(const row of document.querySelectorAll('[data-link]')){
  const link=live.social.links.find(l=>`${l.kind}:${l.userId}`===row.dataset.link);if(!link)continue;
  const status=row.querySelector('.connect-status');if(status)status.innerHTML=connectStatus(link,escapeSocial);
  const accept=row.querySelector('[data-social-action="accept"][data-kind="connect"]');if(accept&&!accept.dataset.busy)accept.disabled=!link.proximity?.ready;
 }
}
async function updateSocialDOM(){
 if(document.querySelector('#community-hub'))await updateCommunity(communityModel());
 else document.querySelectorAll('.social-actions[data-person]').forEach(el=>{if(!el.contains(document.activeElement))el.outerHTML=socialButtons(el.dataset.person,live.social);});
 bindSocialControls();
}
const escapeSocial=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bindSocialControls(){
 bindSocial({api,action,refresh:refreshLive,render:hooks.render,toast:hooks.toast,review:()=>{hooks.reviewRequests();showCommunityRequests();},check:report=>syncSocial(report!==false)});
 document.querySelectorAll('[data-location-profile]').forEach(el=>el.onclick=()=>hooks.openProfileLocation());
 document.querySelectorAll('[data-block]').forEach(el=>el.onclick=()=>action(async()=>{await api(`/blocks/${el.dataset.block}`,'POST');await refreshLive();hooks.render();}));
}
function locate(){if(!live.user)return;if(!window.isSecureContext){hooks.toast('Location requires HTTPS or localhost. Open the HTTPS address on your phone.');return;}try{localStorage.setItem(locationPreference(live.user.id),'on');}catch{}locationSharing.start();}
setInterval(()=>{if(live.user&&!document.hidden&&hooks.getPage?.()==='Community')syncSocial();},4000);
window.addEventListener('pagehide',()=>{locationSharing.stop();if(live.user)fetch('/api/location',{method:'DELETE',headers:{'X-Zindagi':'1'},keepalive:true}).catch(()=>{});});
document.addEventListener('visibilitychange',()=>locationSharing.visibility());
window.addEventListener('online',()=>{if(locationState.enabled)locationSharing.retry();});
export function bindLive(){
  bindAuth();if(!live.user)return;
  bindGuildQuests({id:live.selected,api,action,data:live.guildTasks,toast:hooks.toast,refresh:async()=>{await refreshLive();hooks.render();}});
  document.querySelector('#refresh-live')?.addEventListener('click',()=>action(async()=>{acceptAccount(await api('/me'));await refreshLive();hooks.render();}));
  bindSocialControls();bindCommunity();
  document.querySelector('#live-locate')?.addEventListener('click',locate);
  document.querySelector('#live-stop-location')?.addEventListener('click',()=>action(async()=>{await disableLiveLocation();await refreshLive();hooks.render();}));
  document.querySelector('#live-radius')?.addEventListener('change',e=>action(async()=>{live.radius=Number(e.target.value);await refreshLive();hooks.render();}));
  document.querySelectorAll('[data-live-join]').forEach(el=>el.onclick=()=>action(async()=>{const g=live.guilds.find(g=>g.id===el.dataset.liveJoin);acceptAccount(await api(`/guilds/${g.id}/${g.joined?'membership':'join'}`,g.joined?'DELETE':'POST'));await refreshLive();hooks.render();}));
  document.querySelectorAll('[data-live-board]').forEach(el=>el.onclick=()=>action(async()=>{live.selected=el.dataset.liveBoard;live.aspect='all';await refreshLive();hooks.render();document.querySelector('#guild-board')?.scrollIntoView();}));
  document.querySelectorAll('[data-live-aspect]').forEach(el=>el.onclick=()=>action(async()=>{live.aspect=el.dataset.liveAspect;await refreshLive();hooks.render();document.querySelector('#guild-board')?.scrollIntoView();}));
  const form=document.querySelector('#live-guild-form');form?.addEventListener('input',()=>{guildDraft=Object.fromEntries(new FormData(form));});
  form?.addEventListener('submit',e=>{e.preventDefault();action(async()=>{const g=await api('/guilds','POST',Object.fromEntries(new FormData(form)));live.selected=g.id;guildDraft={name:'',description:'',aspect:'academics'};acceptAccount(await api('/me'));await refreshLive();hooks.render();hooks.toast('Guild created. Other accounts can now join.');});});
}
