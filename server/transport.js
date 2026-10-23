import { readFileSync } from 'node:fs';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
export function transportOptions(env=process.env) {
  const certPath=env.HTTPS_CERT, keyPath=env.HTTPS_KEY;
  if(Boolean(certPath)!==Boolean(keyPath))throw new Error('Set both HTTPS_CERT and HTTPS_KEY to enable HTTPS.');
  return certPath?{cert:readFileSync(certPath),key:readFileSync(keyPath)}:null;
}
export function createWebServer(app,tls) {
  return tls?httpsServer(tls,app):httpServer(app);
}
