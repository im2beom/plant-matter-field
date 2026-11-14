const CACHE = 'pm-rainforest-beta-03-v6';
const FILES = ['./','./index.html','./styles.css?v=3.2','./app.js?v=3.2','./config.js','./manifest.webmanifest','./assets/landPath.json','./assets/plant-matter-wordmark.png','./assets/staurogyne-reference.jpg','./assets/icon-180.png','./assets/icon-512.png'];
self.addEventListener('install', event => {
 event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('pm-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));}return res;}).catch(()=>caches.match('./index.html')));
  return;
 }
 event.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));}return res;}).catch(()=>caches.match(req)));
});
