import {db,kvGet,kvSet,runtime} from './db';
import {generateVapid,sendPush,validateSubscription,b64} from './push';
import {defaultDistrict,prayerDays,source} from './prayers';
import {defaults,buildPlan,dateTR,sleepInfo,clock,at,minute,recipe,type Settings,type PlanEvent,type Session} from '../lib/model';
export type Device={id:string;settings:string;subscription:string|null;revision:number;updated:number};
export const parseSettings=(d:Device):Settings=>({...defaults,...JSON.parse(d.settings)});
export async function hash(text:string){return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));}
export async function identify(req:Request):Promise<Device|null>{const cookie=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('ga_device='))?.slice(10);if(!cookie||!/^[A-Za-z0-9_-]{43}$/.test(cookie))return null;return db().prepare('SELECT * FROM devices WHERE id=?').bind(await hash(cookie)).first<Device>();}
export async function createDevice(){const token=b64(crypto.getRandomValues(new Uint8Array(32)));const id=await hash(token);const settings={...defaults};try{settings.districtId=await defaultDistrict();}catch{/* UI exposes a retryable location error. */}await db().prepare('INSERT INTO devices(id,settings,revision,updated) VALUES(?,?,0,?)').bind(id,JSON.stringify(settings),Date.now()).run();return {token,device:(await db().prepare('SELECT * FROM devices WHERE id=?').bind(id).first<Device>())!};}
export async function vapid(){const saved=await kvGet('vapid');if(saved)return JSON.parse(saved.value);const key=await generateVapid();await db().prepare('INSERT OR IGNORE INTO kv(key,value,updated) VALUES(?,?,?)').bind('vapid',JSON.stringify(key),Date.now()).run();return JSON.parse((await kvGet('vapid'))!.value);}
export async function ensureDistrict(d:Device){const s=parseSettings(d);if(s.districtId)return d;s.districtId=await defaultDistrict();await db().prepare('UPDATE devices SET settings=? WHERE id=? AND revision=?').bind(JSON.stringify(s),d.id,d.revision).run();return (await db().prepare('SELECT * FROM devices WHERE id=?').bind(d.id).first<Device>())!;}
export async function enqueue(d:Device,rows:PlanEvent[],group='plan'){
 const now=Date.now();const statements=rows.filter(x=>x.notify&&x.at>now&&x.expires>now).map(x=>db().prepare('INSERT INTO events(id,device,group_id,revision,due,expires,payload,status,attempts,lease) VALUES(?,?,?,?,?,?,?,\'pending\',0,0) ON CONFLICT(id) DO UPDATE SET status=\'pending\',payload=excluded.payload,lease=0,attempts=0 WHERE events.status=\'cancelled\'').bind(`${d.id}:${group==='plan'?d.revision:group}:${x.key}`,d.id,group,d.revision,x.at,x.expires,JSON.stringify({title:x.title,body:x.body,url:'/?view='+x.href,kind:x.kind})));
 for(let i=0;i<statements.length;i+=80)await db().batch(statements.slice(i,i+80));
}
export async function schedule(d:Device){const s=parseSettings(d);if(!s.reminders||!d.subscription)return;if(!s.districtId)throw Error('Bildirimler için önce konum seç.');const days=await prayerDays(s.districtId);if(!days.some(p=>p.date===dateTR()))throw Error('Bugünün doğrulanmış vakitleri alınamadı. Vakit hatırlatmaları yenilenemedi.');await enqueue(d,days.flatMap(p=>buildPlan(p,s)));}
export async function restoreActive(d:Device){if(!d.subscription||!parseSettings(d).reminders)return;const x=await db().prepare("SELECT * FROM sessions WHERE device=? AND status='running' AND ends>? LIMIT 1").bind(d.id,Date.now()).first<Session>();if(x)await sessionEvents(d,x);}
export async function finishDue(id?:string){await db().prepare("UPDATE sessions SET status='completed',elapsed=duration WHERE status='running' AND ends<=? AND (? IS NULL OR device=?)").bind(Date.now(),id??null,id??null).run();}
export async function schedulerStatus(){const h=await kvGet('heartbeat');const t=h?JSON.parse(h.value):null;return {configured:!!runtime().CRON_SECRET,active:!!t&&Date.now()-t.at<150000,lastTick:t?.at??null};}
export async function state(d:Device){
 await finishDue(d.id);let days:any[]=[];let prayerError='';try{d=await ensureDistrict(d);days=await prayerDays(parseSettings(d).districtId);if(!days.some(x=>x.date===dateTR()))throw Error('Bugünün vakitleri henüz alınamadı.');}catch(e){prayerError=e instanceof Error?e.message:'Vakitlere ulaşılamıyor.';}
 const s=parseSettings(d);
 const sessions=(await db().prepare('SELECT * FROM sessions WHERE device=? ORDER BY started DESC LIMIT 1000').bind(d.id).all()).results;
 const totals=(await db().prepare("SELECT day,kind,SUM(elapsed) AS ms FROM sessions WHERE device=? AND status!='running' GROUP BY day,kind").bind(d.id).all()).results;
 const pending=(await db().prepare("SELECT id,due,payload,status,sent,delivered,error FROM events WHERE device=? AND (status IN ('sent','failed') OR due>=?) ORDER BY due ASC LIMIT 160").bind(d.id,Date.now()-86400000).all()).results;
 return {settings:s,revision:d.revision,days,prayerError,sessions,totals,events:pending,subscribed:!!d.subscription,scheduler:await schedulerStatus(),source,now:Date.now()};
}
export async function startSession(d:Device,kind:string,id:string){
 const s=parseSettings(d),now=Date.now();const lens:Record<string,number>={focus:s.focusMinutes,break:s.breakMinutes,walk:s.walkMinutes,bike:s.bikeMinutes,nap:20};
 if(!(kind in lens)||!/^[a-f0-9-]{36}$/.test(id))throw Error('Geçersiz oturum.');
 await finishDue(d.id);
 const existing=await db().prepare('SELECT * FROM sessions WHERE id=? AND device=?').bind(id,d.id).first<Session>();if(existing)return existing;
 if(kind==='nap'){
 const p=(await prayerDays(s.districtId)).find(x=>x.date===dateTR());
 if(!p||now<at(p.date,p.noon)+15*minute||now+20*minute>at(p.date,p.afternoon)-10*minute)throw Error('Kısa uyku aralığın öğle namazından sonra, ikindiden en az 10 dakika önce bitecek şekilde.');
 }
 const duration=lens[kind]*minute,ends=now+duration;
 const ins=await db().prepare("INSERT INTO sessions(id,device,kind,started,ends,duration,elapsed,status,day) SELECT ?,?,?,?,?,?,0,'running',? WHERE NOT EXISTS(SELECT 1 FROM sessions WHERE device=? AND status IN ('running','paused'))").bind(id,d.id,kind,now,ends,duration,dateTR(now),d.id).run();
 if(!ins.meta.changes)throw Error('Önce devam eden oturumu bitir.');
 const session={id,device:d.id,kind,started:now,ends,duration,elapsed:0,status:'running',day:dateTR(now)};
 if(s.reminders&&d.subscription)await sessionEvents(d,session);
 return session;
}
export async function sessionEvents(d:Device,x:Session){
 const now=Date.now(),rows:PlanEvent[]=[];
 const add=(key:string,t:number,title:string,body:string,href='focus')=>rows.push({key:`${x.id}:${x.ends}:${key}`,at:t,expires:t+10*minute,kind:x.kind,title,body,notify:true,href});
 const moving=['walk','bike'].includes(x.kind),label=x.kind==='bike'?'Bisiklet':'Yürüyüş';
 if(moving){
 if(x.ends-5*minute>now)add('return',x.ends-5*minute,'Dönüşe geçebilirsin',`${label} sürenin bitmesine 5 dakika kaldı. Yavaşça eve dön.`,'activity');
 add('end',x.ends,`${label} tamamlandı`,'Güzel bir nefes arası. Eve döndüğünde kahvaltı hazırlayabilirsin.','activity');
 const r=recipe(parseSettings(d));add('breakfast',x.ends+minute,'Kahvaltı zamanı',r?`${r.title} hazırlayalım mı?`:'Evdeki malzemelerini seç, kahvaltı önerini hazırlayayım.','activity');
 let boundary='bir sonraki namaz vaktine';try{const p=(await prayerDays(parseSettings(d).districtId)).find(p=>p.date===dateTR(x.ends));if(p){const si=sleepInfo(p,parseSettings(d));const options=[p.noon,p.afternoon,p.sunset,p.night].map(t=>at(p.date,t)-5*minute);if(parseSettings(d).recoverySleep&&si.fits&&si.recovery>0)options.push(si.start);const next=options.filter(t=>t>x.ends+21*minute).sort((a,b)=>a-b)[0];if(next)boundary=clock(next)+' saatine';}}catch{}
 add('focus',x.ends+21*minute,'Kendine bir çalışma aralığı aç',`${boundary} kadar uygun bir odak bloğu seçebilirsin. Pomodoro seni bekliyor.`);
 }else if(x.kind==='focus')add('end',x.ends,'Odak süren tamamlandı','Kısa bir mola verebilirsin. Molayı uygulamadan başlat.');
 else if(x.kind==='break')add('end',x.ends,'Mola tamamlandı','Hazırsan sıradaki odak oturumunu başlat.');
 else add('end',x.ends,'20 dakika tamamlandı','Yavaşça kalk, biraz su iç. Uyanmak için telefon alarmını da kullan.','activity');
 await enqueue(d,rows,x.id);
}
export async function modifySession(d:Device,id:string,action:string){
 await finishDue(d.id);const x=await db().prepare('SELECT * FROM sessions WHERE id=? AND device=?').bind(id,d.id).first<Session>();if(!x)throw Error('Oturum bulunamadı.');
 if(['completed','stopped'].includes(x.status))return x;
 const now=Date.now(),elapsed=x.status==='running'?Math.min(x.duration,Math.max(0,x.duration-(x.ends-now))):x.elapsed;
 let status=x.status,ends=x.ends;
 if(action==='pause'){status='paused';}
 else if(action==='resume'){if(x.status!=='paused')return x;status='running';ends=now+x.duration-elapsed;}
 else if(action==='stop'){status='stopped';}
 else throw Error('İşlem tanınmadı.');
 await db().batch([
 db().prepare('UPDATE sessions SET status=?,ends=?,elapsed=? WHERE id=? AND device=?').bind(status,ends,elapsed,id,d.id),
 db().prepare("UPDATE events SET status='cancelled' WHERE device=? AND group_id=? AND status IN ('pending','sending')").bind(d.id,id)]);
 const updated={...x,status,ends,elapsed};if(status==='running'&&parseSettings(d).reminders&&d.subscription)await sessionEvents(d,updated);return updated;
}
export async function dispatch(trigger:'cron'|'manual'='cron'){
 const now=Date.now();await finishDue();
 const active=(await db().prepare('SELECT * FROM devices WHERE subscription IS NOT NULL ORDER BY updated DESC LIMIT 500').all<Device>()).results;
 const last=await kvGet('last-schedule');
 if(!last||now-last.updated>1800000){for(const d of active){try{await schedule(d);}catch{await kvSet('schedule-error:'+d.id,{at:now});}}await kvSet('last-schedule',now);}
 await db().prepare("UPDATE events SET status='expired' WHERE status IN ('pending','sending') AND expires<?").bind(now).run();
 const queue=(await db().prepare("SELECT * FROM events WHERE (status='pending' OR (status='sending' AND lease<?)) AND due<=? AND expires>? AND attempts<4 ORDER BY due LIMIT 100").bind(now,now,now).all<any>()).results;
 const v=queue.length?await vapid():null;let sent=0;
 for(const item of queue){
 const lock=await db().prepare("UPDATE events SET status='sending',lease=?,attempts=attempts+1 WHERE id=? AND (status='pending' OR (status='sending' AND lease<?))").bind(now+90000,item.id,now).run();if(!lock.meta.changes)continue;
 const fresh=await db().prepare('SELECT * FROM devices WHERE id=?').bind(item.device).first<Device>();
 if(!fresh?.subscription||!parseSettings(fresh).reminders||(item.group_id==='plan'&&fresh.revision!==item.revision)){await db().prepare("UPDATE events SET status='cancelled' WHERE id=?").bind(item.id).run();continue;}
 // Recheck cancellation after acquiring the lease, before the external send.
 const valid=await db().prepare("SELECT id FROM events WHERE id=? AND status='sending'").bind(item.id).first();if(!valid)continue;
 const receipt=b64(crypto.getRandomValues(new Uint8Array(24)));await kvSet('receipt:'+item.id,receipt);
 try{
 const result=await sendPush(validateSubscription(JSON.parse(fresh.subscription)),{...JSON.parse(item.payload),id:item.id,receipt,expires:item.expires},v!,runtime().SITE_ORIGIN||'https://chatgpt.com',Math.floor((item.expires-Date.now())/1000));
 if(result.ok){await db().prepare("UPDATE events SET status='sent',sent=?,error=NULL WHERE id=?").bind(Date.now(),item.id).run();sent++;}
 else if([404,410].includes(result.status)){await db().batch([db().prepare('UPDATE devices SET subscription=NULL WHERE id=? AND subscription=?').bind(fresh.id,fresh.subscription),db().prepare("UPDATE events SET status='failed',error='Bildirim iznini yeniden aç.' WHERE id=?").bind(item.id)]);}
 else {await db().prepare("UPDATE events SET status=?,lease=0,error=? WHERE id=?").bind(result.status===429||result.status>=500?'pending':'failed','Bildirim servisi: '+result.status,item.id).run();}
 }catch{await db().prepare("UPDATE events SET status='pending',lease=0,error='Gönderim yeniden denenecek.' WHERE id=?").bind(item.id).run();}
 }
 await db().prepare("UPDATE events SET status='failed' WHERE status='pending' AND attempts>=4").run();
 await db().prepare("DELETE FROM events WHERE expires<?").bind(now-30*86400000).run();
 await db().prepare("DELETE FROM kv WHERE key LIKE 'receipt:%' AND updated<?").bind(now-86400000).run();
 // A manual connection test must not masquerade as an automatic cron run.
 const completedAt=Date.now();await kvSet(trigger==='cron'?'heartbeat':'manual-heartbeat',{at:completedAt});
 return {sent,checked:queue.length,at:completedAt};
}
