let installPrompt=null;
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function updateButton(){const button=document.querySelector('#install-app');if(button)button.hidden=standalone();}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;updateButton();});
window.addEventListener('appinstalled',()=>{installPrompt=null;updateButton();document.querySelector('#install-dialog')?.close();});
matchMedia('(display-mode: standalone)').addEventListener('change',updateButton);
if(import.meta.env.PROD&&'serviceWorker' in navigator&&window.isSecureContext){
 window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{/* Install guidance remains available if browser policy blocks workers. */});});
}
export function installButton(){return `<button class="text-button" id="install-app" ${standalone()?'hidden':''}>Install app</button>`;}
export function bindInstall(){
 updateButton();document.querySelector('#install-app')?.addEventListener('click',async()=>{
  if(installPrompt){const prompt=installPrompt;installPrompt=null;try{await prompt.prompt();await prompt.userChoice;return;}catch{/* Fall back to browser-specific instructions. */}}
  let dialog=document.querySelector('#install-dialog');if(dialog)dialog.remove();
  dialog=document.createElement('dialog');dialog.id='install-dialog';dialog.setAttribute('aria-labelledby','install-title');
  dialog.innerHTML=`<h2 id="install-title">Take Zindagi with you.</h2><p>Install it on your home screen and open it in its own app window.</p>${!window.isSecureContext?'<p class="error-notice">Open the HTTPS link shared by your host first. Installation and camera access do not work from a plain HTTP network address.</p>':''}<ol><li><strong>Android — Chrome:</strong> open the browser menu, then choose <b>Install app</b> or <b>Add to Home screen</b>.</li><li><strong>iPhone/iPad — Safari:</strong> tap <b>Share → Add to Home Screen</b>, enable <b>Open as Web App</b> if shown, and tap Add.</li><li><strong>Desktop — Chrome or Edge:</strong> use the install icon in the address bar or the browser’s Apps menu.</li></ol><p class="fine-print">Use the same HTTPS address each time. Your server must stay running for accounts, guilds, points, and recordings. Private browsing or browser policies may disable installation.</p><button class="button" id="install-close">Got it</button>`;
  document.body.append(dialog);dialog.querySelector('#install-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
 });
}
