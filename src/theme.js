let theme='light';
try{theme=localStorage.getItem('zindagi-theme')||'light';}catch{}
if(!['light','dark'].includes(theme))theme='light';
function applyTheme(){document.documentElement.dataset.theme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#1c2a36':'#faf1e7');}
applyTheme();
export function themeButton(){return `<button class="text-button theme-switch" id="theme-switch" aria-label="Switch to ${theme==='dark'?'light':'dark'} mode">${theme==='dark'?'☀ Light mode':'☾ Dark mode'}</button>`;}
export function bindTheme(){document.querySelector('#theme-switch')?.addEventListener('click',e=>{
 const button=e.currentTarget;
 const update=()=>{theme=theme==='dark'?'light':'dark';applyTheme();try{localStorage.setItem('zindagi-theme',theme);}catch{}button.textContent=theme==='dark'?'☀ Light mode':'☾ Dark mode';button.setAttribute('aria-label',`Switch to ${theme==='dark'?'light':'dark'} mode`);};
 if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches){button.disabled=true;document.startViewTransition(update).finished.catch(()=>{}).finally(()=>button.disabled=false);}else update();
});}
