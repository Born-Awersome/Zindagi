import { openCulturalRecorder } from './cultural-recorder.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function momentFeed(){return `<section class="panel moment-feed" id="moment-feed"><p class="eyebrow">REAL MOMENTS. ONE OPENING.</p><h2>The community stage</h2><p class="muted">Public to signed-in members. Photos show for 10 seconds; videos play once. Opening uses your view, even if you close early or the connection fails. Screenshots cannot be prevented.</p><div class="guild-actions"><button class="button" data-capture="photo">Capture photo</button><button class="button light" data-capture="video">Record video</button><button class="text-button" data-feed-refresh>Refresh</button></div><label class="public-consent"><input type="checkbox" data-mine> My posts only</label><p data-feed-status role="status"></p><div class="guild-quest-grid" data-posts></div><div class="guild-actions"><button class="text-button" data-previous hidden>← Previous</button><button class="text-button" data-next hidden>Next →</button></div></section>`;}
export function bindMomentFeed({api,userId,currentUser,toast}){
 const root=document.querySelector('#moment-feed');if(!root)return;
 const el=name=>root.querySelector(`[data-${name}]`);let offset=0,request=0;
 const valid=()=>root.isConnected&&currentUser()===userId;
 async function refresh(){
  const generation=++request;el('feed-status').textContent='Loading moments…';
  try{const data=await api(`/moments?offset=${offset}&mine=${el('mine').checked}`);if(!valid()||generation!==request)return;
   el('posts').innerHTML=data.posts.map(p=>`<article class="guild-quest"><span class="pill">${p.mime.startsWith('image/')?'PHOTO · 10 SECONDS':'VIDEO · ONE PLAY'}</span><h3>${escape(p.name)}</h3><p class="muted">${escape(new Date(p.createdAt).toLocaleString())}</p><button class="button" data-view="${p.id}" data-mime="${escape(p.mime)}" ${p.viewed?'disabled':''}>${p.viewed?'Already opened':'View once'}</button>${p.creatorId===userId?`<button class="text-button" data-remove="${p.id}">Remove post</button>`:''}</article>`).join('');
   el('feed-status').textContent=data.posts.length?'No previews: your view starts only when you choose Open once.':'No moments here yet. Capture something worth sharing.';
   el('previous').hidden=offset===0;el('next').hidden=!data.hasMore;
   root.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view,b.dataset.mime));
   root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this public moment? New viewers will no longer be able to open it.'))return;b.disabled=true;try{await api(`/moments/${b.dataset.remove}`,'DELETE');await refresh();}catch(e){toast(e.message);b.disabled=false;}});
  }catch(e){if(valid()&&generation===request)el('feed-status').textContent=e.message;}
 }
 el('feed-refresh').onclick=refresh;el('mine').onchange=()=>{offset=0;refresh();};el('next').onclick=()=>{offset+=20;refresh();};el('previous').onclick=()=>{offset=Math.max(0,offset-20);refresh();};
 root.querySelectorAll('[data-capture]').forEach(b=>b.onclick=()=>{const kind=b.dataset.capture;openCulturalRecorder({account:true,moment:true,kind,
  begin:async()=>{if(currentUser()!==userId)throw new Error('Account changed. Open capture again.');return (await api('/moments/captures','POST',{kind})).id;},
  discard:id=>api(`/moments/captures/${id}`,'DELETE'),clearPending:async()=>{throw new Error('Close unfinished captures or wait 15 minutes, then retry.');},
  submit:async(blob,id,makePublic)=>{if(currentUser()!==userId)throw new Error('Account changed. Record again.');const response=await fetch(`/api/moments/captures/${id}/publish?public=${makePublic}`,{method:'POST',headers:{'Content-Type':blob.type,'X-Zindagi':'1'},body:blob});const result=await response.json();if(!response.ok)throw new Error(result.error);return result;},
  completed:async()=>{if(valid()){offset=0;await refresh();toast('Your view-once moment is public.');}}
 });});
 function view(id,mime){
  const dialog=document.createElement('dialog');dialog.className='moment-viewer';dialog.innerHTML='<h2>One moment. One opening.</h2><p>Closing, leaving this page, or switching tabs ends your view. A failed transfer also uses the view.</p><p data-message role="status"></p><div data-stage></div><button class="button" data-open>Open once</button><button class="text-button" data-close>Close</button>';
  document.body.append(dialog);let url=null,closed=false,timer=null,media=null;const controller=new AbortController();
  const close=()=>{if(closed)return;closed=true;controller.abort();clearTimeout(timer);media?.pause?.();if(media)media.removeAttribute('src');if(url)URL.revokeObjectURL(url);observer.disconnect();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',close);dialog.close();dialog.remove();if(valid())refresh();};
  const hidden=()=>{if(document.hidden)close();};
  const observer=new MutationObserver(()=>{if(!valid())close();});observer.observe(document.querySelector('#app'),{childList:true});
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',close);dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.querySelector('[data-open]').onclick=async e=>{
   e.target.disabled=true;e.target.hidden=true;const message=dialog.querySelector('[data-message]');message.textContent='Opening your moment…';
   try{const response=await fetch(`/api/moments/${id}/view`,{method:'POST',headers:{'X-Zindagi':'1'},cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error((await response.json()).error);const blob=await response.blob();if(closed||!valid())return;url=URL.createObjectURL(blob);const photo=mime.startsWith('image/');media=document.createElement(photo?'img':'video');media.src=url;media.oncontextmenu=e=>e.preventDefault();media.onerror=()=>{message.textContent='This device could not display the capture. The view has been used.';};dialog.querySelector('[data-stage]').append(media);
    if(photo){media.alt='View-once community photo';message.textContent='This photo closes in 10 seconds.';timer=setTimeout(close,10000);}
    else{media.playsInline=true;media.controls=false;media.disablePictureInPicture=true;media.onended=close;message.textContent='One playback. This view closes when the video ends.';timer=setTimeout(close,90000);try{await media.play();}catch{const play=document.createElement('button');play.className='button';play.textContent='Play video';play.onclick=async()=>{try{await media.play();play.remove();}catch{message.textContent='Playback unavailable. This view has been used.';}};dialog.querySelector('[data-stage]').append(play);}}
   }catch(e){if(!closed)message.textContent=e.name==='AbortError'?'View closed.':e.message||'Could not load this moment. Your view may have been used.';}
  };
  dialog.showModal();
 }
 refresh();
}
