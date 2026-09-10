const CACHE='gun-akisi-v2';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/offline.html','/icons/icon-192.png'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))]));});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 // Authenticated data and API responses are never cached across devices.
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));
});
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
 let p={title:'Gün Akışı',body:'Yeni bir hatırlatman var.',url:'/'};
 try{if(event.data)p={...p,...event.data.json()};}catch{}
 const expired=p.expires&&Date.now()>p.expires;
 const url=typeof p.url==='string'&&p.url.startsWith('/?')?p.url:'/';
 const picture=typeof p.image==='string'&&/^\/api\/reminder-media\/[a-f0-9-]{36}$/.test(p.image)?p.image:undefined;
 const options={body:expired?'Bu hatırlatmanın zamanı geçti. Güncel planı uygulamadan kontrol et.':p.body,icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:p.id||'gun-akisi',data:{url},renotify:false};
 if(picture&&!expired&&'image' in Notification.prototype)options.image=picture;
 try{await self.registration.showNotification(expired?'Gecikmiş hatırlatma':p.title,options);}catch(error){if(!options.image)throw error;delete options.image;await self.registration.showNotification(p.title,options);}
 if(p.receipt&&p.id)await fetch('/api/receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:p.id,receipt:p.receipt})}).catch(()=>{});
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{const url=new URL(event.notification.data?.url||'/',self.location.origin).href;const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const tab of tabs){if(new URL(tab.url).origin===self.location.origin){await tab.navigate(url);return tab.focus();}}return self.clients.openWindow(url);})());
});
