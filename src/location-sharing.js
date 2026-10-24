import { LOCATION_TTL_MS } from './proximity-policy.js';

// Device acquisition and server presence are separate: a transient error must not
// revoke the user's choice. Inject dependencies so races can be tested without GPS.
export function createLocationSharing({geo,send,remove,onChange,now=Date.now,
 setEvery=setInterval,clearEvery=clearInterval,hidden=()=>document.hidden}){
 let enabled=false,generation=0,watch=null,heartbeat=null,pendingFix=false;
 let queue=Promise.resolve(),expiresAt=0,accuracy=null,lastTimestamp=0,lastSentAt=0,lastAttempt=0;
 let phase='off',message='Location sharing is off.';
 const options={enableHighAccuracy:true,maximumAge:0,timeout:20000};
 const snapshot=()=>({enabled,phase,message,accuracy,sharing:enabled&&!hidden()&&expiresAt>now(),expiresAt});
 const emit=()=>onChange(snapshot());
 function state(next,text){phase=next;message=text;emit();}
 function clearDevice(){generation++;if(watch!==null)geo?.clearWatch(watch);watch=null;if(heartbeat!==null)clearEvery(heartbeat);heartbeat=null;pendingFix=false;}
 function erase(){expiresAt=0;accuracy=null;lastTimestamp=0;lastSentAt=0;queue=queue.catch(()=>{}).then(()=>remove()).catch(()=>{});return queue;}
 function stop(reason='Location sharing is off.') {enabled=false;clearDevice();const done=erase();state('off',reason);return done;}
 function fail(error,gen){
  if(gen!==generation||!enabled||hidden())return;
  if(error.code===1){stop('Location permission denied. Allow precise location in your browser and phone settings, then try again. Friends still works without GPS.');return;}
  state('retrying',error.code===3?'GPS is taking longer than usual. Still enabled; retrying automatically. Try near a window or outdoors.':'GPS is temporarily unavailable. Still enabled; retrying automatically. Check that device location is on.');
 }
 function position(p,gen){
  if(gen!==generation||!enabled||hidden())return;
  if(!Number.isFinite(p.timestamp)||p.timestamp<=lastTimestamp||now()-p.timestamp>=LOCATION_TTL_MS)return;
  if(expiresAt>now()&&now()-lastSentAt<5000)return;
  // Reserve this timestamp before enqueueing so watch + one-shot callbacks cannot duplicate it.
  lastTimestamp=p.timestamp;lastSentAt=now();
  queue=queue.catch(()=>{}).then(async()=>{
   if(gen!==generation||!enabled||hidden())return;
   try{
    const result=await send({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,capturedAt:p.timestamp});
    if(gen!==generation||!enabled||hidden())return;
    // Convert server expiry into a local deadline using the age of this device fix.
    expiresAt=Math.min(now()+LOCATION_TTL_MS,p.timestamp+LOCATION_TTL_MS);accuracy=result.accuracyMeters??p.coords.accuracy;
    state('active',`Precise sharing active · accuracy ±${Math.ceil(accuracy)} m. ${accuracy>10?'Improving GPS accuracy for Connect; try outdoors.':'Location updates automatically while this page is visible.'}`);
   }catch(error){
    if(gen!==generation||!enabled)return;
    if(error.status===401||error.status===403){stop('Your session ended. Sign in again to share location.');return;}
    // Failed sends do not cancel the watch. Allow a fresh retry, never extend an old fix.
    lastTimestamp=0;
    state('retrying',error.status===400||error.status===409?`${error.message} Still enabled; waiting for a fresh reading.`:'Location could not sync. Still enabled; retrying when the connection returns.');
   }
  });
 }
 function acquire(gen){
  if(gen!==generation||!enabled||hidden()||pendingFix)return;
  pendingFix=true;lastAttempt=now();
  geo.getCurrentPosition(p=>{if(gen!==generation)return;pendingFix=false;position(p,gen);},error=>{if(gen!==generation)return;pendingFix=false;fail(error,gen);},options);
 }
 function run(){
  const gen=generation;
  state('acquiring','GPS is enabled. Waiting for a precise reading; this may take a little longer indoors.');
  watch=geo.watchPosition(p=>position(p,gen),error=>fail(error,gen),options);
  acquire(gen);
  heartbeat=setEvery(()=>{
   if(gen!==generation||!enabled||hidden())return;
   if(expiresAt&&expiresAt<=now()&&phase==='active')state('retrying','GPS is still enabled. The last reading expired; retrying for a fresh fix. Connect will unlock when both readings are ready.');
   if(now()-lastAttempt>=10000)acquire(gen);
  },5000);
 }
 function start(){
  if(!geo){state('off','This browser does not support location. Use a browser with GPS support over HTTPS.');return;}
  if(enabled){retry();return;}
  enabled=true;
  if(hidden()){state('paused','Location is paused while the app is hidden. Return here to resume.');return;}
  run();
 }
 function retry(){if(!enabled){start();return;}if(!hidden())acquire(generation);}
 function visibility(){
  if(!enabled)return;
  if(hidden()){clearDevice();erase();state('paused','Location paused while the app is hidden. It will resume when you return to this page.');}
  else if(phase==='paused')run();
 }
 return {start,retry,stop,visibility,snapshot};
}
