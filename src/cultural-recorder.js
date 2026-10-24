import { MAX_RECORDING_BYTES, MIN_RECORDING_BYTES, MAX_RECORDING_MS } from './recording-policy.js';

let activeRecorder = null;
export function closeCulturalRecorder(){return activeRecorder?.close();}

// This dialog lives outside #app so a dashboard refresh cannot detach a live camera.
export function openCulturalRecorder({account, guildPoints=null, begin, discard, clearPending, submit, completed}) {
  if (activeRecorder) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'cultural-recorder';
  dialog.setAttribute('aria-labelledby','cultural-title');
  dialog.innerHTML = `<button class="dialog-x" data-close aria-label="Discard and close recording">×</button>
    <p class="eyebrow">CULTURAL QUEST · ${guildPoints===null?"+1 POINT":`+${guildPoints} GUILD PTS AFTER APPROVAL`}</p><h2 id="cultural-title">Your talent. Your stage.</h2>
    <p>Sing a song, play guitar, dance, or show another cultural talent. Capture it here—existing files cannot be selected.</p>
    <label class="capture-kind">Capture format<select data-kind><option value="video">Video performance</option><option value="photo">Photo</option></select></label><div class="capture-stage"><video data-video playsinline aria-label="Live camera preview or recorded performance"></video><img data-photo hidden alt="Your captured Cultural photo"><div class="capture-placeholder" data-placeholder><span>♫</span><strong>Make this moment yours</strong><small>Camera + microphone · record up to 60 seconds</small></div><span class="capture-indicator" data-indicator hidden><i></i> RECORDING LIVE</span></div>
    <p class="capture-status" data-status role="status">Your camera and microphone are off.</p>
    <p class="capture-error" data-error role="alert"></p>
    <div class="capture-actions"><button class="button" data-enable>Enable camera & microphone</button><button class="button" data-record hidden>Start recording</button><button class="button capture-stop" data-stop hidden>Stop recording</button><button class="button light" data-retake hidden>Retake</button><button class="button" data-submit hidden>${guildPoints===null?"Submit performance · +1 point":"Submit for leader approval"}</button></div>
    ${account?`<label class="public-consent"><input type="checkbox" data-public> Share this Cultural photo or video publicly with signed-in members (unlimited replay)</label><p class="fine-print">Shared photos and videos appear in the Cultural gallery on Challenges and can be watched repeatedly. You can remove your posts there.</p>`:""}
    <button class="text-button" data-recover hidden>Discard an unfinished recording</button><button class="text-button" data-discard>Discard & close</button>
    <p class="fine-print">${account?'After submission, private quest clips are discarded; shared photos and videos are saved for the Cultural gallery. Guild rewards still need leader approval. Nothing is published without your choice.':'Local demo: the clip stays in memory in this tab and is discarded when you finish or close. The point stays in this browser.'} Camera and microphone stop when you finish recording, leave this tab, or close this dialog.</p>`;
  document.body.append(dialog);
  const el = name => dialog.querySelector(`[data-${name}]`);
  const video = el('video');
  let phase='intro',stream=null,recorder=null,chunks=[],bytes=0,blob=null,url=null,ticket=null,closed=false,stopTimeout=null,invalid=false;
  const operationId = crypto.randomUUID();
  activeRecorder = {close};
  const photoMode=()=>el('kind').value==='photo';
  function error(message){el('error').textContent=message;}
  function phaseTo(next,message){
    phase=next;dialog.dataset.phase=next;
    if(message)el('status').textContent=message;
    el('enable').hidden=!['intro','error'].includes(next);
    el('kind').disabled=!['intro','error'].includes(next);
    el('enable').textContent=next==='error'?'Try camera again':photoMode()?'Enable camera':'Enable camera & microphone';
    el('record').textContent=photoMode()?'Take photo':'Start recording';
    if(el('public'))el('public').disabled=next==='submitting';
    el('record').hidden=next!=='ready';
    el('stop').hidden=next!=='recording';
    el('retake').hidden=next!=='review';
    el('submit').hidden=next!=='review';
    el('indicator').hidden=next!=='recording';
    el('close').disabled=next==='submitting';el('discard').disabled=next==='submitting';
  }
  function release(){clearTimeout(stopTimeout);stream?.getTracks().forEach(track=>track.stop());stream=null;}
  function clearClip(){blob=null;chunks=[];bytes=0;if(url)URL.revokeObjectURL(url);url=null;el('photo').hidden=true;el('photo').removeAttribute('src');video.hidden=false;video.pause();video.srcObject=null;video.removeAttribute('src');video.controls=false;el('placeholder').hidden=false;}
  async function cancelTicket(){const id=ticket;if(id)await discard(id);if(ticket===id)ticket=null;}
  async function close(){
    if(closed||phase==='submitting')return;
    closed=true;if(recorder?.state==='recording')recorder.stop();release();clearClip();
    document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('pagehide',onPageHide);
    dialog.close();dialog.remove();activeRecorder=null;
    try{await cancelTicket();}catch{/* Server tickets expire if a disconnect prevents cancellation. */}
  }
  function onPageHide(){close();}
  function onVisibility(){
    if(!document.hidden)return;
    if(phase==='recording')stopRecording('Recording stopped because this tab was hidden. Review or retake your performance.');
    else if(['ready','requesting','starting'].includes(phase)){release();phaseTo('error','Camera stopped while this tab was hidden.');error('Return to this tab and enable the camera again.');}
  }
  document.addEventListener('visibilitychange',onVisibility);window.addEventListener('pagehide',onPageHide);
  function supportedMime(){return ['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type));}
  async function enable(){
    if(closed)return;
    error('');
    if(!window.isSecureContext){phaseTo('error','This connection blocks camera access.');error('Your browser blocks recording over HTTP on another computer’s network address. Ask the host to share an HTTPS link (setup: docs/device-recording.md), then open that link directly in Chrome, Edge, Firefox, or Safari. Changing camera permissions alone will not fix HTTP.');return;}
    if(!navigator.mediaDevices?.getUserMedia){phaseTo('error','Camera unavailable in this browser.');error('Open this HTTPS link directly in an up-to-date browser, outside an embedded chat browser. Check device camera and microphone permissions.');return;}
    if(!photoMode()&&(!window.MediaRecorder||!supportedMime())){phaseTo('error','Recording is not supported by this browser.');error('Use an up-to-date Chrome, Edge, Firefox, or Safari browser with video recording support.');return;}
    phaseTo('requesting',photoMode()?'Allow access to your camera in the browser prompt.':'Allow access to your camera and microphone in the browser prompt.');
    try {
      const captured=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30},facingMode:'user'},audio:!photoMode()});
      if(closed||document.hidden||phase!=='requesting'){captured.getTracks().forEach(t=>t.stop());return;}
      stream=captured;clearClip();video.srcObject=stream;video.muted=true;video.controls=false;el('placeholder').hidden=true;
      await video.play().catch(()=>{});
      for(const track of stream.getTracks())track.onended=()=>{if(phase==='recording')stopRecording('Camera or microphone disconnected. Review the captured portion or retake.');else if(phase==='ready'){release();phaseTo('error','Camera or microphone disconnected.');}};
      phaseTo('ready',photoMode()?'Camera ready. Tap Take photo when you’re ready.':'Camera and microphone ready. Nothing is being recorded yet.');el('record').focus();
    } catch(e) {
      if(closed)return;release();phaseTo('error','Camera and microphone are off.');
      error(e.name==='NotAllowedError'?(photoMode()?'Camera permission was denied. Allow camera access in your browser settings, then try again.':'Permission was denied. Allow both camera and microphone in your browser settings, then try again.'):e.name==='NotFoundError'?'A camera and microphone are required. Connect them and try again.':e.name==='NotReadableError'?'The camera or microphone may be in use by another app. Close that app and retry.':'Could not start the camera. Check your device and browser permissions.');
    }
  }
  let stoppedMessage='';
  function stopRecording(message='Recording complete. Play it back, retake, or submit your performance.'){
    if(phase!=='recording')return;
    stoppedMessage=message;phaseTo('processing','Preparing your preview…');clearTimeout(stopTimeout);
    if(recorder?.state==='recording')recorder.stop();
    release();
  }
  async function takePhoto(){
    error('');phaseTo('starting','Preparing your photo…');
    try{
      if(ticket)await cancelTicket();ticket=await begin();
      if(closed||document.hidden||phase!=='starting'){await cancelTicket();return;}
      if(!video.videoWidth||!video.videoHeight||!stream?.getVideoTracks().some(t=>t.readyState==='live'))throw new Error('Camera is not ready. Enable it again.');
      const canvas=document.createElement('canvas'),scale=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
      blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));
      if(closed||document.hidden||phase!=='starting'){release();await cancelTicket();return;}
      if(!blob||blob.size<MIN_RECORDING_BYTES)throw new Error('Photo could not be captured. Please try again.');
      release();video.srcObject=null;video.hidden=true;url=URL.createObjectURL(blob);el('photo').src=url;el('photo').hidden=false;el('placeholder').hidden=true;
      phaseTo('review','Photo captured. Review, retake, or submit.');el('submit').focus();
    }catch(e){if(closed)return;release();phaseTo('error','Photo was not captured.');error(e.message);el('recover').hidden=!(account&&e.status===409);try{await cancelTicket();}catch{}}
  }
  async function record(){
    if(phase!=='ready')return;
    if(photoMode()){await takePhoto();return;}
    error('');phaseTo('starting','Preparing your recording…');
    try {
      if(ticket)await cancelTicket();
      ticket=await begin();
      if(closed||document.hidden||phase!=='starting'){await cancelTicket();return;}
      if(!stream?.getVideoTracks().some(t=>t.readyState==='live')||!stream?.getAudioTracks().some(t=>t.readyState==='live'))throw new Error('Camera or microphone stopped. Enable them again.');
      chunks=[];bytes=0;invalid=false;
      recorder=new MediaRecorder(stream,{mimeType:supportedMime(),videoBitsPerSecond:1000000,audioBitsPerSecond:64000});
      recorder.ondataavailable=e=>{if(closed)return;if(e.data.size){bytes+=e.data.size;if(bytes>MAX_RECORDING_BYTES){invalid=true;stopRecording();}else chunks.push(e.data);}};
      recorder.onerror=()=>{invalid=true;stopRecording();};
      recorder.onstop=async()=>{
        release();if(closed)return;
        video.srcObject=null;video.muted=false;
        blob=new Blob(chunks,{type:recorder.mimeType});chunks=[];
        if(invalid||blob.size<MIN_RECORDING_BYTES){clearClip();phaseTo('error','No usable recording captured.');error(invalid?'Recording failed or exceeded the size limit. Try a shorter performance.':'Record a little more of your performance before stopping.');try{await cancelTicket();}catch{}return;}
        url=URL.createObjectURL(blob);video.src=url;video.controls=true;video.muted=false;el('placeholder').hidden=true;
        phaseTo('review',stoppedMessage||'Recording complete. Review your performance.');el('submit').focus();
      };
      recorder.start(500);phaseTo('recording','Recording your camera and microphone. Stop when your performance is finished.');el('stop').focus();
      stopTimeout=setTimeout(()=>stopRecording('The 60-second clip limit was reached. Review or retake your performance.'),MAX_RECORDING_MS);
    }catch(e){if(closed)return;release();phaseTo('error','Recording did not start.');error(e.message||'Please try again.');el('recover').hidden=!(account&&e.status===409);try{await cancelTicket();}catch{}}
  }
  el('recover').onclick=async()=>{el('recover').disabled=true;try{await clearPending();ticket=null;el('recover').hidden=true;error('');phaseTo('error','Unfinished recording discarded. You can enable the camera again.');}catch(e){error(e.message);}finally{el('recover').disabled=false;}};
  el('kind').onchange=()=>{phaseTo('intro',photoMode()?'Camera is off. Choose Enable camera to take a new photo.':'Camera and microphone are off.');el('placeholder').querySelector('small').textContent=photoMode()?'Camera only · capture a fresh photo':'Camera + microphone · record up to 60 seconds';};
  el('enable').onclick=enable;el('record').onclick=record;el('stop').onclick=()=>stopRecording();
  el('retake').onclick=async()=>{if(phase!=='review')return;phaseTo('processing','Discarding this take…');try{await cancelTicket();clearClip();await enable();}catch(e){phaseTo('review','Could not discard the session. Please retry.');error(e.message);}};
  el('submit').onclick=async()=>{
    if(phase!=='review'||!blob)return;
    phaseTo('submitting','Submitting your captured performance…');error('');video.pause();
    try {const receipt={id:operationId,bytes:blob.size};const result=await submit(blob,ticket,Boolean(el('public')?.checked));ticket=null;phase='finished';await close();await completed(result,receipt);}
    catch(e){if(closed)return;phaseTo('review','Submission failed. Your take is still available here.');error(e.message||'Check your connection and retry.');}
  };
  el('close').onclick=close;el('discard').onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.showModal();el('enable').focus();
}
