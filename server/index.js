import { createApp } from './app.js';
const {app,close}=createApp();
const port=Number(process.env.PORT||3001);
const server=app.listen(port,'0.0.0.0',()=>console.log(`Zindagi API listening on port ${port}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{close();process.exit(0);}));
