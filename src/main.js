import { streakCard } from './streak.js';
import { dashboard } from './dashboard.js';
import './dashboard.css';
import { progressJournal, bindJournal } from './journal.js';
import './profile.css';
import { resetInterface, bindInterface } from './interface.js';
import { installButton, bindInstall } from './pwa.js';
import { culturalGallery, bindCulturalGallery } from './cultural-gallery.js';
import './style.css';
import './game.css';
import './light.css';
import './mobile.css';
import './motion.css';
import './identity.css';
import './community.css';
import { wordmark } from './identity.js';
import { themeButton, bindTheme } from './theme.js';
import { openCulturalRecorder } from './cultural-recorder.js';
import { aspectStyle, icon, progress, achievements, badgeShelf } from './game.js';
import { live, api, configureLive, acceptAccount, refreshLive, action, authDialog, bindLive, bindAuth, locationPanel, liveCommunity, liveLeaderboard, liveGuildView } from './live.js';
import { categories, tasks } from './data.js';
import { initialState } from './state.js';
let authLoading=true,authError='';
let state = initialState();

let focusMode=false, reward=null, detail=null, badge=null;
let page = 'Dashboard', filter = 'all', serverOffset = 0, completing = false, retryAfter = 0;
function acceptServer(data) { authLoading=false;serverOffset = data.serverNow - Date.now(); state = {...initialState(), ...data}; }
function restoreGuest(){state=initialState();serverOffset=0;authLoading=false;focusMode=false;reward=null;detail=null;badge=null;page='Dashboard';filter='all';retryAfter=0;render();}
configureLive({openProfileLocation:()=>{page="My profile";render();document.querySelector("#profile-location")?.scrollIntoView({block:"center"});},reviewRequests:()=>{page="Community";render();document.querySelector("#community-hub")?.scrollIntoView({block:"start"});document.querySelector("#community-hub h1")?.focus({preventScroll:true});},getPage:()=>page,accept:acceptServer, logout:restoreGuest, render:()=>render(), toast:message=>toast(message)});
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const total = () => Object.values(state.points).reduce((a,b) => a+b,0);
function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(window.toastTimeout); window.toastTimeout = setTimeout(() => el.classList.remove('show'), 4000); }
function radar() {
  const point = (i,r) => [160 + Math.sin(i*2*Math.PI/5)*r, 145 - Math.cos(i*2*Math.PI/5)*r];
  const polygon = r => categories.map((_,i) => point(i,r).join(',')).join(' ');
  const scale = Math.max(5, Math.ceil(Math.max(...Object.values(state.points))/5)*5);
  return `<svg viewBox="0 0 320 290" role="img" aria-label="Life stats: ${categories.map(c => `${c.name} ${state.points[c.id]} points`).join(', ')}">
  ${[1,2,3,4,5].map(n => `<polygon points="${polygon(100*n/5)}" fill="${n%2 ? '#ffffff03':'none'}" stroke="#ffffff15"/>`).reverse().join('')}
  ${categories.map((_,i) => `<line x1="160" y1="145" x2="${point(i,100)[0]}" y2="${point(i,100)[1]}" stroke="#ffffff15"/>`).join('')}
  <polygon points="${categories.map((c,i) => point(i,100*state.points[c.id]/scale).join(',')).join(' ')}" fill="#b4a1ff33" stroke="#b4a1ff" stroke-width="2.5"/>
  ${categories.map((c,i) => { const [x,y]=point(i,125); return `<text x="${x}" y="${y}" text-anchor="middle" class="chart-label">${c.name}</text><text x="${x}" y="${y+16}" text-anchor="middle" class="chart-value">${state.points[c.id]} pts</text>`; }).join('')}</svg><p class="chart-caption">Each axis: 0–${scale} points · Progress across your five life aspects</p>`;
}
function taskCards() { return `<div class="filters" aria-label="Filter challenges">${[{id:'all',name:'All aspects'},...categories].map(c=>`<button class="chip ${filter===c.id?'selected':''}" data-filter="${c.id}" aria-pressed="${filter===c.id}">${c.name}</button>`).join('')}</div><div class="task-grid">${(live.user && live.tasks.length ? live.tasks : tasks).filter(t=>filter==='all'||t.category===filter).map(t=>{const c=categories.find(c=>c.id===t.category); return `<article class="task-card" style="--accent:${aspectStyle[c.id].color}"><div class="task-top"><span class="task-icon">${icon(c.id)}</span><span class="reward">+${t.points} ${c.name} point</span></div><p class="eyebrow quest-tag">${t.tag}</p><h3>${t.title}</h3><p class="task-description">${t.description}${live.user&&t.reason?`<br><strong>${escape(t.reason)}</strong>`:''}</p><button class="quest-details" data-task-detail="${t.id}">View quest briefing <span>→</span></button><div class="task-bottom"><span>${t.mode==='recording'?'● Live recording':`◷ ${t.minutes} min`} <span class="dot">·</span> ${c.name}</span><button class="start-task" data-start="${t.id}" ${state.session?'disabled':''}>${t.mode==='recording'?'Capture talent':'Start quest'} <span>→</span></button></div></article>`;}).join('')}</div>`; }
function timer() { if(!state.session) return ''; const s=state.session; return `<section class="session"><div class="session-copy"><span class="eyebrow">YOUR ACTIVE SESSION</span><h3>${escape(s.title)}</h3><p id="phase"></p><div class="session-track"><i id="session-progress"></i></div></div><strong id="countdown" aria-label="Time remaining"></strong><div class="session-actions"><button class="text-button" id="enter-focus">Enter focus mode →</button><button class="button light" id="pause">${s.pausedAt?'Resume':'Pause'}</button><button class="text-button" id="cancel">End session</button></div></section>`; }
function community(full=false){return liveCommunity(escape,full);}
function leaderboard(){return liveLeaderboard(escape);}
function profile() { return `<div class="profile-grid"><section class="panel"><p class="eyebrow">YOUR PLAYER IDENTITY</p><h2>Make it yours.</h2><form id="profile-form"><label>Your name<input name="name" value="${escape(state.name)}" required maxlength="32"></label><label>Your motto<input name="goal" value="${escape(state.goal)}" maxlength="100"></label><label>What are you focusing on?<select name="interests">${categories.map(c=>`<option value="${c.id}" ${state.interests===c.id?'selected':''}>${c.name}</option>`).join('')}</select></label>${live.user?`<label class="discovery-option"><input type="checkbox" name="discoverable" ${state.discoverable?'checked':''}>Appear in recommendations and the community leaderboard</label><p class="muted">Your display name, goal, focus, and points are visible when enabled. Your exact username can be used to send requests. Your location preference is managed below, separately from profile discovery.</p>`:''}<label>Streak time zone<select name="timeZone">${[...new Set([state.streak?.timeZone||'Asia/Kolkata','UTC',...(Intl.supportedValuesOf?.('timeZone')||['Asia/Kolkata','Europe/London','America/New_York'])])].map(zone=>`<option value="${escape(zone)}" ${zone===state.streak?.timeZone?'selected':''}>${escape(zone.replaceAll('_',' '))}</option>`).join('')}</select></label><p class="muted">Your streak day resets at midnight in this time zone.</p><button class="button" type="submit">Save profile ›</button></form></section><section class="panel stats-panel"><p class="eyebrow">YOUR LIFE, IN BALANCE</p><h2>${escape(state.name)}’s stats</h2><p class="muted">${escape(state.goal)}</p>${radar()}</section></div>${live.user?locationPanel(escape):'<section class="panel"><h2>Location preference</h2><p class="muted">Sign in to manage precise location for nearby discovery and Connect, once for this device.</p><button class="button light" data-social-signin>Sign in to set up location</button></section>'}${streakCard(state.streak)}${progressJournal(state,live.user.id)}${badgeShelf(state)}`; }
function gameDialogs() {
  const t=detail?tasks.find(t=>t.id===detail):null, b=badge?achievements(state.points).find(b=>b.id===badge):null;
  return `<dialog id="focus-dialog" class="focus-dialog" aria-label="Focus session"><button class="dialog-x" id="exit-focus" aria-label="Exit focus mode">×</button><p class="eyebrow">ONE QUEST. YOUR FULL ATTENTION.</p><h2>${escape(state.session?.title||'Your quest')}</h2><div class="focus-ring"><div><span id="focus-phase">DEEP FOCUS</span><strong id="focus-time"></strong><small>One step closer to your next level</small></div></div><div class="dialog-actions"><button class="button" id="focus-pause">${state.session?.pausedAt?'Resume quest':'Pause quest'}</button><button class="button light" id="focus-return">Back to dashboard</button></div><p class="fine-print">Complete the full session to earn 1 category point.</p></dialog>
  <dialog id="reward-dialog" class="reward-dialog" aria-label="Quest reward"><button class="dialog-x" id="reward-x" aria-label="Close reward">×</button><div class="reward-burst" aria-hidden="true">${Array.from({length:12},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div><span class="victory-medal">${icon(reward?.category||'academics')}</span><p class="eyebrow">${reward?.levelUp?'LEVEL UP!':'QUEST COMPLETE'}</p><h2>${reward?.levelUp?`Welcome to level ${progress(state.points).level}.`:'You showed up. It counts.'}</h2><p>${escape(reward?.title||'')}</p><div class="earned-reward">+1 <span>${categories.find(c=>c.id===reward?.category)?.name||''} Point</span></div><p class="fine-print">${live.user?'Your reward is saved to your account.':'Your reward is saved in this browser.'}</p><button class="button" id="reward-close">Keep the adventure going →</button></dialog>
  <dialog id="quest-dialog" class="quest-dialog" aria-label="Quest and achievement details"><button class="dialog-x" id="quest-close" aria-label="Close details">×</button>${t?`<span class="briefing-icon" style="color:${aspectStyle[t.category].color}">${icon(t.category)}</span><p class="eyebrow">QUEST BRIEFING</p><h2>${escape(t.title)}</h2><p>${escape(t.description)}</p><div class="briefing-meta"><span>${t.mode==='recording'?'RECORD IN APP':`${t.minutes} MINUTES`}</span><span>+${t.points} ${categories.find(c=>c.id===t.category).name.toUpperCase()} POINT</span></div>${t.mode==='recording'?'<ol class="quest-steps"><li>Choose Photo or Video and enable the camera. Video also needs microphone access.</li><li>Record yourself singing, playing guitar, dancing, or performing a cultural talent.</li><li>Review your fresh take and submit it for 1 Cultural Point. Choose Photo or Video, capture it here, and review before submitting.</li></ol>':`<ol class="quest-steps"><li>Make time and prepare your space.</li><li>${t.break?`${t.focus} minutes of focus, then ${t.break} minutes of rest.`:'Stay with your activity for the full session.'}</li><li>Finish the timer to earn your category point.</li></ol>`}<button class="button" id="briefing-start" ${state.session?'disabled':''}>${state.session?'Finish your active quest first':'Accept quest →'}</button>`:b?`<span class="victory-medal ${b.unlocked?'':'locked'}">${icon(b.aspect)}</span><p class="eyebrow">${b.unlocked?'ACHIEVEMENT UNLOCKED':'YOUR NEXT ACHIEVEMENT'}</p><h2>${b.name}</h2><p>${b.description}</p><div class="xp-track"><i style="width:${b.current/b.target*100}%"></i></div><p class="fine-print">${b.current} / ${b.target} · Badges celebrate progress without adding extra points.</p>`:''}</dialog>`;
}
function bindGame() {
  const closeReward=()=>{reward=null;document.querySelector('#reward-dialog').close();};
  document.querySelector('#reward-close').onclick=closeReward;document.querySelector('#reward-x').onclick=closeReward;
  document.querySelector('#reward-dialog').addEventListener('cancel',()=>{reward=null;});
  const exitFocus=()=>{focusMode=false;document.querySelector('#focus-dialog').close();};
  document.querySelector('#exit-focus').onclick=exitFocus;document.querySelector('#focus-return').onclick=exitFocus;
  document.querySelector('#focus-dialog').addEventListener('cancel',()=>{focusMode=false;});
  document.querySelector('#home-resume')?.addEventListener('click',()=>{focusMode=true;document.querySelector('#focus-dialog').showModal();updateTimer();});
  document.querySelector('#enter-focus')?.addEventListener('click',()=>{focusMode=true;document.querySelector('#focus-dialog').showModal();updateTimer();});
  document.querySelector('#focus-pause').onclick=()=>document.querySelector('#pause')?.click();
  document.querySelectorAll('[data-task-detail]').forEach(el=>el.onclick=()=>{detail=el.dataset.taskDetail;badge=null;render();});
  document.querySelectorAll('[data-badge]').forEach(el=>el.onclick=()=>{badge=el.dataset.badge;detail=null;render();});
  const closeDetails=()=>{detail=null;badge=null;document.querySelector('#quest-dialog').close();};
  document.querySelector('#quest-close').onclick=closeDetails;
  document.querySelector('#quest-dialog').addEventListener('cancel',()=>{detail=null;badge=null;});
  document.querySelector('#briefing-start')?.addEventListener('click',()=>{const id=detail;closeDetails();document.querySelector(`[data-start="${id}"]`)?.click();});
}
function startCultural() {
  if(!live.user)return;const accountId=live.user.id, previousLevel=progress(state.points).level;
  openCulturalRecorder({
    account:!!accountId,
    begin:async()=>accountId?(await api('/recordings/start','POST')).id:crypto.randomUUID(),
    discard:async id=>{if(accountId){const response=await fetch(`/api/recordings/${id}`,{method:'DELETE',headers:{'X-Zindagi':'1'},keepalive:true});if(!response.ok)throw new Error('Could not discard the previous take. Check your connection and retry.');}},
    clearPending:async()=>{if(accountId)await api('/recordings/current','DELETE');},
    submit:async(blob,id,makePublic)=>{
      if(!accountId)return null;
      if(live.user?.id!==accountId)throw new Error('Your account changed. Sign in and record again.');
      const response=await fetch(`/api/recordings/${id}/submit${makePublic?"?public=true":""}`,{method:'POST',headers:{'Content-Type':blob.type,'X-Zindagi':'1'},credentials:'same-origin',body:blob});
      const data=await response.json().catch(()=>({error:'The server could not process your recording.'}));
      if(!response.ok)throw new Error(data.error||'Submission failed. Please retry.');
      return data;
    },
    completed:async(data,receipt)=>{
      if(accountId){if(live.user?.id!==accountId)return;acceptAccount(data);await refreshLive();}
      else {return;}
      reward={title:'Showcase your cultural talent',category:'cultural',levelUp:progress(state.points).level>previousLevel};
      render();toast('Performance submitted. +1 Cultural Point!');
    },
  });
}
function render() {
  resetInterface();if(authLoading)return;
  if(!live.user){document.querySelector('#app').innerHTML=`<div class="auth-entry" role="main"><div class="auth-entry-tools">${installButton()}${themeButton()}</div><a class="brand" href="#" aria-label="Zindagi">${wordmark()}</a><p class="eyebrow">YOUR NEXT LEVEL IS REAL LIFE</p><h1>Less scrolling.<br>More becoming.</h1><p>Make time for what matters. Build your skills, find your people, and keep your progress in one place.</p><div class="auth-entry-actions"><button class="button" id="account-button">Sign in</button><button class="button light" id="create-account">Create account</button></div><p class="auth-entry-error" role="status">${escape(authError)}</p>${authError?'<button class="text-button" id="retry-connection">Retry connection</button>':''}<small>Five aspects. One you.</small></div><div id="toast" role="status"></div>${authDialog()}`;bindAuth();bindTheme();bindInstall();document.querySelector('#create-account').onclick=()=>{const select=document.querySelector('#auth-mode');select.value='register';select.dispatchEvent(new Event('change'));document.querySelector('#auth-dialog').showModal();};document.querySelector('#retry-connection')?.addEventListener('click',()=>location.reload());return;}

  document.querySelector('#app').innerHTML=`<aside class="sidebar" id="navigation-drawer" aria-label="Main navigation"><button class="drawer-close" id="menu-close" aria-label="Close navigation">×</button><a class="brand" href="#" aria-label="Zindagi home">${wordmark()}</a><p class="side-label">LIFE, IN PROGRESS.</p><nav>${[['Dashboard','◫'],['Challenges','⚑'],['Leaderboard','▥'],['Community','◎'],['Guilds','⚑'],['My profile','◉']].map(([name,icon])=>`<button data-page="${name}" class="nav-item ${page===name?'active':''}" ${page===name?'aria-current="page"':''}><span>${icon}</span>${name==='Dashboard'?'Home':name}${page===name?'<b>•</b>':''}</button>`).join('')}</nav><div class="sidebar-note"><span>✧</span><p>YOUR NEXT CHECKPOINT</p><h3>Level ${Math.floor(total()/5)+2}</h3><div class="xp-track"><i style="width:${total()%5/5*100}%"></i></div><p>${5-total()%5} more points.<br>You’ve got this.</p></div><button class="sidebar-profile" data-page="My profile"><span class="avatar small">${escape(state.name.slice(0,2).toUpperCase())}</span><span><strong>${escape(state.name)}</strong><small>Level ${Math.floor(total()/5)+1} · Explorer</small></span><span>›</span></button></aside><button class="drawer-backdrop" id="drawer-backdrop" aria-label="Close navigation" aria-hidden="true" tabindex="-1"></button><main><header><button class="menu-toggle" id="menu-toggle" aria-label="Open navigation" aria-controls="navigation-drawer" aria-expanded="false"><span></span><span></span><span></span></button><div class="breadcrumb">Your life, your adventure <span>/ ${page==='Dashboard'?'Home':page}</span></div><div class="header-actions">${installButton()}${themeButton()}<button class="text-button" id="account-button">${live.user?'Sign out':'Sign in / Create account'}</button><button class="avatar small" data-page="My profile" aria-label="Edit profile">${escape(state.name.slice(0,2).toUpperCase())}</button></div></header><div class="content" data-view="${page}"><div class="page-heading"><div><p class="eyebrow">A LITTLE BETTER. EVERY DAY.</p><h1>${page==='Dashboard'?`Hi, ${escape(state.name)}.`:page==='Challenges'?'Choose your next adventure.':page==='Community'?'Grow alongside good company.':page==='Guilds'?'Find your people. Build your guild.':page==='My profile'?'This is your story.':'Show up. Move up.'}</h1><p>${page==='Dashboard'?'Ready for your next step?':'Meaningful effort. Visible progress. One challenge at a time.'}</p></div></div>${timer()}${page==='Dashboard'?dashboard(state,live,radar):page==='Challenges'?taskCards()+(live.user?culturalGallery():''):page==='Leaderboard'?leaderboard():page==='Community'?community(true):page==='Guilds'?liveGuildView(escape):profile()}<footer>Made for a life well lived. <span>Zindagi · Your progress, saved.</span></footer></div></main><div id="toast" role="status"></div>${gameDialogs()}${authDialog()}`;
  bind(); bindInterface(page); updateTimer();
  if(focusMode&&state.session)document.querySelector('#focus-dialog')?.showModal();
  if(reward)document.querySelector('#reward-dialog')?.showModal();
  if(detail||badge)document.querySelector('#quest-dialog')?.showModal();
}
function bind() {
  bindGame();bindJournal(state);
  bindLive();bindTheme();bindInstall();if(live.user)bindCulturalGallery({api,userId:live.user.id,currentUser:()=>live.user?.id,toast});
  document.querySelector('.brand').onclick=e=>{e.preventDefault(); page='Dashboard';render();};
  document.querySelectorAll('[data-page]').forEach(el=>el.onclick=()=>{page=el.dataset.page;render();window.scrollTo(0,0);if(live.user)action(async()=>{await refreshLive();render();});});
  document.querySelectorAll('[data-filter]').forEach(el=>el.onclick=()=>{filter=el.dataset.filter;render();});
  document.querySelectorAll('[data-start]').forEach(el=>el.onclick=()=>{if(!live.user||state.session)return;if(tasks.find(t=>t.id===el.dataset.start)?.mode==='recording'){startCultural();return;}action(async()=>{acceptAccount(await api('/sessions','POST',{taskId:el.dataset.start}));render();});});
  document.querySelector('#pause')?.addEventListener('click',()=>action(async()=>{acceptAccount(await api(`/sessions/${state.session.id}/${state.session.pausedAt?'resume':'pause'}`,'POST'));render();}));
  document.querySelector('#cancel')?.addEventListener('click',()=>action(async()=>{acceptAccount(await api(`/sessions/${state.session.id}/cancel`,'POST'));render();}));
  document.querySelector('#profile-form')?.addEventListener('submit',e=>{e.preventDefault();const data=new FormData(e.target);action(async()=>{acceptAccount(await api('/me','PATCH',{name:data.get('name').trim(),goal:data.get('goal').trim(),interests:data.get('interests'),discoverable:data.has('discoverable'),timeZone:data.get('timeZone')}));await refreshLive();render();toast('Profile saved.');});});
}

function updateTimer() {
  if(!state.session){focusMode=false;return;}
  const title=state.session.title, completedAspect=state.session.category, previousLevel=progress(state.points).level,accountId=live.user?.id;
  if(live.user && !state.session.pausedAt && Date.now()+serverOffset>=state.session.endsAt && !completing && Date.now()>retryAfter){completing=true;api(`/sessions/${state.session.id}/complete`,'POST').then(async data=>{if(live.user?.id!==accountId)return;acceptAccount(data);await refreshLive();focusMode=false;reward={title,category:completedAspect,levelUp:progress(state.points).level>previousLevel};render();toast('Session completed. Point awarded to your account.');}).catch(error=>{retryAfter=Date.now()+10000;toast(error.message);}).finally(()=>{completing=false;});}
  const s=state.session, now=s.pausedAt||(Date.now()+serverOffset), remaining=Math.max(0,Math.ceil((s.endsAt-now)/1000));
  const el=document.querySelector('#countdown');if(!el)return;
  el.textContent=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
  const percent=Math.min(100,Math.max(0,100*(1-(s.endsAt-now)/s.duration)));
  const bar=document.querySelector('#session-progress');if(bar)bar.style.width=`${percent}%`;
  const focusTime=document.querySelector('#focus-time');if(focusTime)focusTime.textContent=el.textContent;
  const ring=document.querySelector('.focus-ring');if(ring)ring.style.setProperty('--progress',`${percent}%`);
  const inBreak=s.break && (now-s.startedAt)>=s.duration*(s.focus/s.minutes);
  document.querySelector('#phase').textContent=`${s.pausedAt?'Paused · ':''}${inBreak?'Rest and recharge. You’ve earned this break.':s.break?'Focus time. One thing at a time.':'Put in the work. Mark this session as your own.'} Completion is self-reported.`;
  const focusPhase=document.querySelector('#focus-phase');if(focusPhase)focusPhase.textContent=s.pausedAt?'SESSION PAUSED':inBreak?'REST & RECHARGE':'DEEP FOCUS';
}
render();setInterval(updateTimer,250);
api('/me','GET',undefined,{signal:AbortSignal.timeout(12000)}).then(async data=>{acceptAccount(data,true);await refreshLive();render();}).catch(error=>{authLoading=false;authError=error.status===401?'':'Could not reach the server. Check your connection and try again.';render();});

setInterval(async()=>{if(!live.user||document.hidden)return;const id=live.user.id;try{const data=await api('/me','GET',undefined,{silent:true,signal:AbortSignal.timeout(12000)});if(live.user?.id!==id)return;acceptAccount(data);document.querySelectorAll('[data-streak]').forEach(el=>el.outerHTML=streakCard(state.streak));}catch{}},60000);
