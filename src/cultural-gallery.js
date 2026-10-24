import { bindVideoLoading } from './interface.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function culturalGallery(){return `<section class="panel cultural-gallery" id="cultural-gallery"><p class="eyebrow">CULTURAL CHALLENGES</p><h2>Watch Cultural performances</h2><p class="muted">Videos shared from Cultural challenges. Watch, pause, seek, and replay as often as you like. Record your own performance using the Cultural quest above.</p><button class="text-button" data-gallery-refresh>Refresh videos</button><label class="public-consent"><input type="checkbox" data-mine> My videos only</label><p data-status role="status"></p><div class="guild-quest-grid" data-videos></div><div class="guild-actions"><button class="text-button" data-previous hidden>← Previous</button><button class="text-button" data-next hidden>Next →</button></div></section>`;}
export function bindCulturalGallery({api,userId,currentUser,toast}){
 const root=document.querySelector('#cultural-gallery');if(!root)return;
 const el=name=>root.querySelector(`[data-${name}]`);let offset=0,request=0;
 const valid=()=>root.isConnected&&currentUser()===userId;
 async function refresh(){
  const generation=++request;el('status').textContent='Loading Cultural videos…';el('status').classList.add('is-loading');
  try{const data=await api(`/cultural-videos?offset=${offset}&mine=${el('mine').checked}`);if(!valid()||generation!==request)return;
   el('videos').innerHTML=data.posts.map(p=>`<article class="guild-quest"><span class="pill">CULTURAL PERFORMANCE</span><h3>${escape(p.name)}</h3><p class="muted">${escape(new Date(p.createdAt).toLocaleString())}</p><div class="video-frame" aria-busy="false"><video controls playsinline preload="none" src="/api/cultural-videos/${p.id}/media" aria-label="Cultural performance by ${escape(p.name)}"></video><div class="video-buffering" role="status" hidden><span class="loading-orbit" aria-hidden="true"></span><span>Buffering video…</span></div></div><p data-playback-status role="status"></p>${p.creatorId===userId?`<button class="text-button" data-remove="${p.id}">Remove video</button>`:''}</article>`).join('');
   root.querySelectorAll('video').forEach(bindVideoLoading);
   el('status').textContent=data.posts.length?'Replay any performance using its video controls.':'No shared Cultural videos yet. Complete a Cultural quest and choose to share it.';
   el('previous').hidden=offset===0;el('next').hidden=!data.hasMore;
   root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this shared Cultural video? Your earned points will stay.'))return;b.disabled=true;try{await api(`/cultural-videos/${b.dataset.remove}`,'DELETE');await refresh();}catch(e){toast(e.message);b.disabled=false;}});
  }catch(e){if(valid()&&generation===request)el('status').textContent=e.message;}finally{if(valid()&&generation===request)el('status').classList.remove('is-loading');}
 }
 el('gallery-refresh').onclick=refresh;el('mine').onchange=()=>{offset=0;refresh();};el('next').onclick=()=>{offset+=20;refresh();};el('previous').onclick=()=>{offset=Math.max(0,offset-20);refresh();};refresh();
}
