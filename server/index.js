import { createApp } from './app.js';
import { transportOptions, createWebServer } from './transport.js';
const tls=transportOptions();
const {app,close}=createApp({production:!!tls||process.env.NODE_ENV==='production'});
const port=Number(process.env.PORT||3001);
const host=process.env.HOST||'0.0.0.0';
const server=createWebServer(app,tls);
server.listen(port,host,()=>{
  console.log('Zindagi: '+(tls?'https':'http')+'://localhost:'+port);
  if(tls)console.log('Other devices: use https://<host-PC-IP>:'+port+' with a certificate trusted by that device and valid for that IP.');
  else console.log('Phone/laptop cameras require HTTPS. See docs/device-recording.md for a shared HTTPS link or local HTTPS setup.');
});
server.on('error',error=>{console.error('Server could not start:',error.message);close();process.exitCode=1;});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{close();process.exit(0);}));
