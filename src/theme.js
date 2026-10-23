let theme='dark';
try{theme=localStorage.getItem('zindagi-theme')==='light'?'light':'dark';}catch{}
document.documentElement.dataset.theme=theme;
export function themeButton(){return `<button class="text-button theme-switch" id="theme-switch" aria-label="Switch to ${theme==='dark'?'light':'dark'} mode">${theme==='dark'?'☀ Light mode':'☾ Dark mode'}</button>`;}
export function bindTheme(){document.querySelector('#theme-switch')?.addEventListener('click',e=>{theme=theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('zindagi-theme',theme);}catch{}e.currentTarget.textContent=theme==='dark'?'☀ Light mode':'☾ Dark mode';e.currentTarget.setAttribute('aria-label',`Switch to ${theme==='dark'?'light':'dark'} mode`);});}
