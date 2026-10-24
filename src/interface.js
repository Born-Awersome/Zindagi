let cleanup=()=>{},lastPage=null,requests=0,loadingTimer=null;
export function resetInterface(){cleanup();cleanup=()=>{};}
export function startLoading(){
 let indicator=document.querySelector('#network-loading');
 if(!indicator){indicator=document.createElement('div');indicator.id='network-loading';indicator.setAttribute('role','status');indicator.setAttribute('aria-hidden','true');indicator.innerHTML='<span class="loading-orbit" aria-hidden="true"></span><span>Syncing your adventure…</span>';document.body.append(indicator);}
 requests++;if(requests===1)loadingTimer=setTimeout(()=>{indicator.classList.add('visible');indicator.setAttribute('aria-hidden','false');},160);
 let finished=false;return ()=>{if(finished)return;finished=true;requests=Math.max(0,requests-1);if(!requests){clearTimeout(loadingTimer);indicator.classList.remove('visible');indicator.setAttribute('aria-hidden','true');}};
}
export function bindInterface(page){
 const sidebar=document.querySelector('#navigation-drawer'),toggle=document.querySelector('#menu-toggle'),closeButton=document.querySelector('#menu-close'),backdrop=document.querySelector('#drawer-backdrop'),main=document.querySelector('main');
 const mobile=matchMedia('(max-width: 800px)');let open=false;
 function close(restore=true){open=false;document.body.classList.remove('drawer-open');main.inert=false;sidebar.inert=mobile.matches;toggle.setAttribute('aria-expanded','false');sidebar.removeAttribute('aria-modal');sidebar.setAttribute('role','complementary');backdrop.setAttribute('aria-hidden','true');if(restore&&mobile.matches)toggle.focus();}
 function show(){if(!mobile.matches)return;open=true;sidebar.inert=false;sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');document.body.classList.add('drawer-open');toggle.setAttribute('aria-expanded','true');backdrop.setAttribute('aria-hidden','false');main.inert=true;closeButton.focus({preventScroll:true});}
 function keys(event){if(!open)return;if(event.key==='Escape'){event.preventDefault();close();return;}if(event.key!=='Tab')return;const focusable=[...sidebar.querySelectorAll('button:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(!sidebar.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first)?.focus();return;}if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
 const resize=()=>close(false);toggle.onclick=()=>open?close():show();closeButton.onclick=()=>close();backdrop.onclick=()=>close();document.addEventListener('keydown',keys);mobile.addEventListener('change',resize);close(false);
 cleanup=()=>{close(false);document.removeEventListener('keydown',keys);mobile.removeEventListener('change',resize);};
 // Preserve native select behavior and accessibility while drawing an animated arrow.
 document.querySelectorAll('select').forEach(select=>{if(select.parentElement.classList.contains('select-shell'))return;const shell=document.createElement('span');shell.className='select-shell';select.before(shell);shell.append(select);});
 const content=document.querySelector('.content');if(lastPage!==page){content.classList.add('view-enter');if(lastPage!==null){const title=content.querySelector('h1');title.tabIndex=-1;title.focus({preventScroll:true});}}lastPage=page;
}
export function bindVideoLoading(video){
 const frame=video.closest('.video-frame'),overlay=frame.querySelector('.video-buffering');
 const busy=value=>{overlay.hidden=!value;frame.setAttribute('aria-busy',String(value));};
 for(const event of ['loadstart','waiting','seeking'])video.addEventListener(event,()=>busy(true));
 for(const event of ['playing','canplay','seeked','pause','ended','error','emptied'])video.addEventListener(event,()=>busy(false));
 video.addEventListener('error',()=>{frame.nextElementSibling.textContent='This video is unavailable or cannot play in this browser. Refresh or try another browser.';});
}
