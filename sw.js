const CACHE='pm-rainforest-beta-08-v1';
const FILES=['./','./index.html','./styles.css?v=8.0','./app.js?v=8.0','./i18n.js','./config.js','./manifest.webmanifest','./terms.html','./privacy.html','./assets/landPath.json','./assets/plant-matter-wordmark.png','./assets/staurogyne-reference.jpg','./assets/icon-180.png','./assets/icon-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('pm-rainforest-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));}return res;}).catch(()=>caches.match('./index.html')));return;
 }
 event.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));}return res;}).catch(()=>caches.match(req)));
});
