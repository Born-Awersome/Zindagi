// Only public, static offline-screen resources are cached. Account/API/media
// responses and mutations always go to the server, never an offline queue.
const CACHE='zindagi-offline-v3';
const FILES=['/offline.html','/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png','/icons/apple-touch-icon.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));
  // Do not force activation during an active recording or task session.
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('zindagi-offline-')&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(async()=>{
      const cache=await caches.open(CACHE);return (await cache.match('/offline.html'))||Response.error();
    }));return;
  }
  if(FILES.includes(url.pathname))event.respondWith((async()=>{
    const cache=await caches.open(CACHE);return (await cache.match(url.pathname))||fetch(request);
  })());
});
