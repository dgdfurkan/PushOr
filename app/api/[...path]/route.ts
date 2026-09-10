import {db,kvGet,kvSet,runtime} from '../../../server/db';
import {cities,districts,prayerDays} from '../../../server/prayers';
import {identify,createDevice,state,parseSettings,ensureDistrict,schedule,restoreActive,vapid,startSession,modifySession,dispatch,hash,type Device} from '../../../server/service';
import {validateSettings,defaults} from '../../../lib/model';
import {sendPush,validateSubscription} from '../../../server/push';
const json=(value:unknown,status=200,headers:Record<string,string>={})=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...headers}});
async function body(req:Request){if(Number(req.headers.get('content-length')||0)>12000)throw Error('İstek çok büyük.');const text=await req.text();if(text.length>12000)throw Error('İstek çok büyük.');return JSON.parse(text||'{}');}
async function handler(req:Request){
 try{
 const url=new URL(req.url),path=url.pathname.replace(/^\/api\//,'');
 if(path==='health')return json({ok:true});
 if(path==='tick'){
 if(req.method!=='POST')return json({error:'POST gerekli.'},405);
 const secret=runtime().CRON_SECRET;if(!secret)return json({error:'Zamanlayıcı henüz bağlı değil.'},503);
 const token=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 if(await hash(token)!==await hash(secret))return json({error:'Yetkisiz istek.'},401);
 const trigger=req.headers.get('x-gun-akisi-trigger')==='cron'?'cron':'manual';
 return json(await dispatch(trigger));
 }
 if(path==='receipt'&&req.method==='POST'){
 const data=await body(req);if(typeof data.id!=='string'||data.id.length>240||typeof data.receipt!=='string')return json({error:'Geçersiz bildirim.'},400);
 const saved=await kvGet('receipt:'+data.id);if(!saved||JSON.parse(saved.value)!==data.receipt)return json({error:'Yetkisiz istek.'},401);
 await db().prepare('UPDATE events SET delivered=? WHERE id=? AND delivered IS NULL').bind(Date.now(),data.id).run();return json({ok:true});
 }
 if(req.method==='POST'&&(req.headers.get('x-gun-akisi')!=='1'||req.headers.get('sec-fetch-site')==='cross-site'))return json({error:'İstek doğrulanamadı.'},403);
 if(path==='locations'&&req.method==='GET'){
 const city=url.searchParams.get('city'),force=url.searchParams.get('refresh')==='1';return json(city?await districts(city,force):await cities(force));
 }
 if(path==='vapid'&&req.method==='GET')return json({publicKey:(await vapid()).public});
 let d=await identify(req);
 if(path==='bootstrap'&&req.method==='POST'){
 if(d)return json(await state(d));const created=await createDevice();return json(await state(created.device),200,{'Set-Cookie':`ga_device=${created.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`});
 }
 if(!d)return json({error:'Bağlantın yenilenmeli. Sayfayı yenile.'},401);
 if(path==='state'&&req.method==='GET')return json(await state(d));
 if(req.method!=='POST')return json({error:'Bulunamadı.'},404);
 const input=await body(req);
 if(path==='settings'){
 const old=parseSettings(d),s=validateSettings(input.settings,old);
 if(input.revision!==d.revision)return json({error:'Ayarlar başka bir ekranda değişmiş. Yenileyip tekrar dene.'},409);
 if(s.districtId!==old.districtId||s.cityId!==old.cityId){
 const [cs,ds]=await Promise.all([cities(),districts(s.cityId)]);const city=cs.find((x:any)=>x.id===s.cityId),district=ds.find((x:any)=>x.id===s.districtId);if(!city||!district)throw Error('İl ve ilçe eşleşmiyor.');s.cityName=city.name;s.districtName=district.name;s.prayerAreaName=district.name;
 const days=await prayerDays(s.districtId);if(!days.length)throw Error('Yeni konumun vakitleri alınamadı. Önceki konum korunuyor.');
 }
 const updated=await db().prepare('UPDATE devices SET settings=?,revision=revision+1,updated=? WHERE id=? AND revision=?').bind(JSON.stringify(s),Date.now(),d.id,d.revision).run();if(!updated.meta.changes)return json({error:'Ayarlar değişmiş. Sayfayı yenile.'},409);
 d=(await db().prepare('SELECT * FROM devices WHERE id=?').bind(d.id).first<Device>())!;
 await db().prepare("UPDATE events SET status='cancelled' WHERE device=? AND status IN ('pending','sending') AND (group_id='plan' OR ?=0)").bind(d.id,s.reminders?1:0).run();
 let warning='';try{await schedule(d);await restoreActive(d);}catch{warning='Ayarlar kaydedildi. Vakit servisine ulaşılamadığı için yeni bildirim planı henüz hazırlanamadı.';}
 return json({...await state(d),warning});
 }
 if(path==='subscribe'){
 const subscription=validateSubscription(input.subscription);await db().prepare('UPDATE devices SET subscription=?,updated=? WHERE id=?').bind(JSON.stringify(subscription),Date.now(),d.id).run();d={...d,subscription:JSON.stringify(subscription)};let warning='';try{await schedule(d);await restoreActive(d);}catch{warning='Bildirim izni kaydedildi; namaz vakitleri alınamadığı için plan henüz oluşturulamadı.';}return json({...await state(d),warning});
 }
 if(path==='unsubscribe'){
 await db().batch([db().prepare('UPDATE devices SET subscription=NULL WHERE id=?').bind(d.id),db().prepare("UPDATE events SET status='cancelled' WHERE device=? AND status IN ('pending','sending')").bind(d.id)]);return json({ok:true});
 }
 if(path==='test-push'){
 if(!d.subscription)throw Error('Önce bildirimleri etkinleştir.');const limit=await kvGet('push-test:'+d.id);if(limit&&Date.now()-limit.updated<15000)return json({error:'Yeni test için 15 saniye bekle.'},429);
 await kvSet('push-test:'+d.id,Date.now());
 const id=crypto.randomUUID(),receipt=crypto.randomUUID();await kvSet('receipt:'+id,receipt);
 await db().prepare("INSERT INTO events(id,device,group_id,revision,due,expires,payload,status,attempts,lease) VALUES(?,?,'test',?,?,?,?,'pending',1,0)").bind(id,d.id,d.revision,Date.now(),Date.now()+120000,JSON.stringify({title:'Bildirim denemesi',body:'Gün Akışı bu telefona ulaşabiliyor.'})).run();
 const result=await sendPush(validateSubscription(JSON.parse(d.subscription)),{title:'Gün Akışı burada',body:'Bu bildirimi görüyorsan telefonuna bağlantı tamam. Zamanlayıcı durumunu uygulamada kontrol et.',url:'/?view=settings',id,receipt,expires:Date.now()+120000},await vapid(),runtime().SITE_ORIGIN||url.origin);
 if(!result.ok){await db().prepare("UPDATE events SET status='failed',error=? WHERE id=?").bind('Bildirim servisi: '+result.status,id).run();if([404,410].includes(result.status))await db().prepare('UPDATE devices SET subscription=NULL WHERE id=?').bind(d.id).run();throw Error('Bildirim gönderilemedi. İzni kapatıp yeniden aç.');}
 await db().prepare("UPDATE events SET status='sent',sent=? WHERE id=?").bind(Date.now(),id).run();return json({ok:true});
 }
 if(path==='session/start')return json(await startSession(d,input.kind,input.id));
 if(path==='session/action')return json(await modifySession(d,input.id,input.action));
 if(path==='refresh-plan'){d=await ensureDistrict(d);await prayerDays(parseSettings(d).districtId,true);await schedule(d);await restoreActive(d);return json(await state(d));}
 return json({error:'Bulunamadı.'},404);
 }catch(e){console.error('Gün Akışı request failed',e instanceof Error?e.message:'Unknown');const msg=e instanceof Error?e.message:'';return json({error:/D1|SQLITE|fetch|timeout|JSON|network/i.test(msg)?'Servise şu an ulaşılamıyor. Birazdan yeniden dene.':msg||'İşlem tamamlanamadı.'},400);}
}
export const GET=handler;export const POST=handler;
