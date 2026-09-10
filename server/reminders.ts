import {db,bucket} from './db';
import {MAX_MEDIA_BYTES,mediaUrl,type ReminderInput} from '../lib/reminders';
import type {Device} from './service';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const TTL=15*60000;
type Row={id:string;device:string;title:string;description:string;due:number;media_id:string|null;revision:number};
type MediaRow={id:string;device:string;name:string;type:string;size:number;created:number};
const enabled=(d:Device)=>!!d.subscription&&JSON.parse(d.settings).reminders!==false;
const eventId=(r:Row)=>`custom:${r.id}:${r.revision}`;

export function validateReminder(raw:unknown):ReminderInput{
 if(!raw||typeof raw!=='object')throw Error('Hatırlatma okunamadı.');const x=raw as ReminderInput;
 if(typeof x.id!=='string'||!UUID.test(x.id))throw Error('Hatırlatma kimliği geçersiz.');
 if(typeof x.title!=='string'||!x.title.trim()||x.title.length>80||/[\u0000-\u001f\u007f]/.test(x.title))throw Error('Başlık 1–80 karakter olmalı.');
 if(typeof x.description!=='string'||x.description.length>600||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(x.description))throw Error('Açıklama en fazla 600 karakter olabilir.');
 if(!Number.isSafeInteger(x.due)||x.due<Date.now()+5000||x.due>Date.now()+366*86400000)throw Error('Önümüzdeki bir yıl içinde, gelecekte bir tarih ve saat seç.');
 if(x.mediaId!==null&&(typeof x.mediaId!=='string'||!UUID.test(x.mediaId)))throw Error('Dosya seçimi geçersiz.');
 if(x.revision!==undefined&&(!Number.isSafeInteger(x.revision)||x.revision<0))throw Error('Hatırlatma sürümü geçersiz.');
 return {...x,title:x.title.trim(),description:x.description.trim()};
}
export async function listReminders(d:Device){
 const rows=(await db().prepare(`SELECT r.*,m.name AS media_name,m.type AS media_type,m.size AS media_size,e.status AS event_status,e.delivered
 FROM reminders r LEFT JOIN reminder_media m ON m.id=r.media_id AND m.device=r.device
 LEFT JOIN events e ON e.id=('custom:'||r.id||':'||r.revision)
 WHERE r.device=? ORDER BY CASE WHEN r.due>=? THEN 0 ELSE 1 END,r.due ASC LIMIT 200`).bind(d.id,Date.now()).all<any>()).results;
 return rows.map(r=>({id:r.id,title:r.title,description:r.description,due:r.due,mediaId:r.media_id,revision:r.revision,media:r.media_type?{id:r.media_id,name:r.media_name,type:r.media_type,size:r.media_size,url:mediaUrl(r.media_id)}:null,status:r.event_status||(r.due<Date.now()?'expired':'waiting'),delivered:r.delivered||null}));
}
export async function queueReminder(d:Device,r:Row){
 if(!enabled(d)||r.due+TTL<=Date.now())return;
 const media=r.media_id?await db().prepare('SELECT type FROM reminder_media WHERE id=? AND device=?').bind(r.media_id,d.id).first<{type:string}>():null;
 const payload={title:r.title,body:r.description,url:'/?view=reminders&reminder='+r.id,kind:'custom',...(media?.type.startsWith('image/')?{image:mediaUrl(r.media_id!)}:{})};
 await db().prepare(`INSERT INTO events(id,device,group_id,revision,due,expires,payload,status,attempts,lease)
 SELECT ?,device,?,revision,due,due+?,?, 'pending',0,0 FROM reminders WHERE id=? AND device=? AND revision=?
 ON CONFLICT(id) DO UPDATE SET status='pending',lease=0,attempts=0 WHERE events.status='cancelled'`)
 .bind(eventId(r),'custom:'+r.id,TTL,JSON.stringify(payload),r.id,d.id,r.revision).run();
}
export async function restoreReminders(d:Device){if(!enabled(d))return;const rows=(await db().prepare('SELECT * FROM reminders WHERE device=? AND due>? ORDER BY due LIMIT 200').bind(d.id,Date.now()-TTL).all<Row>()).results;for(const r of rows)await queueReminder(d,r);}
export async function saveReminder(d:Device,raw:unknown){
 const x=validateReminder(raw);
 if(x.mediaId&&!await db().prepare('SELECT id FROM reminder_media WHERE id=? AND device=?').bind(x.mediaId,d.id).first())throw Error('Dosya bulunamadı. Yeniden ekleyebilirsin.');
 const old=await db().prepare('SELECT * FROM reminders WHERE id=? AND device=?').bind(x.id,d.id).first<Row>();
 if(old){
  // Retried creates are idempotent; editing always supplies the displayed revision.
  if(x.revision===undefined){if(old.title===x.title&&old.description===x.description&&old.due===x.due&&old.media_id===x.mediaId){await queueReminder(d,old);return;}throw Error('Bu kayıt zaten var. Listeyi yenile.');}
  const result=await db().prepare('UPDATE reminders SET title=?,description=?,due=?,media_id=?,revision=revision+1,updated=? WHERE id=? AND device=? AND revision=? AND (? IS NULL OR EXISTS(SELECT 1 FROM reminder_media WHERE id=? AND device=?))').bind(x.title,x.description,x.due,x.mediaId,Date.now(),x.id,d.id,x.revision,x.mediaId,x.mediaId,d.id).run();
  if(!result.meta.changes)throw Error('Hatırlatma başka bir ekranda değişmiş. Listeyi yenile.');
  await db().prepare("UPDATE events SET status='cancelled' WHERE id=? AND device=? AND status IN ('pending','sending')").bind(eventId(old),d.id).run();
 }else{
  if(x.revision!==undefined)throw Error('Hatırlatma bulunamadı. Listeyi yenile.');
  const result=await db().prepare('INSERT OR IGNORE INTO reminders(id,device,title,description,due,media_id,revision,created,updated) SELECT ?,?,?,?,?,?,0,?,? WHERE (SELECT COUNT(*) FROM reminders WHERE device=?)<200 AND (? IS NULL OR EXISTS(SELECT 1 FROM reminder_media WHERE id=? AND device=?))').bind(x.id,d.id,x.title,x.description,x.due,x.mediaId,Date.now(),Date.now(),d.id,x.mediaId,x.mediaId,d.id).run();
  if(!result.meta.changes)throw Error('Yeni kayıt eklenemedi. Eski hatırlatmalarını temizleyip yeniden dene.');
 }
 const saved=await db().prepare('SELECT * FROM reminders WHERE id=? AND device=?').bind(x.id,d.id).first<Row>();if(saved)await queueReminder(d,saved);
 if(old?.media_id&&old.media_id!==x.mediaId)await removeMedia(d,old.media_id).catch(()=>{});
}
export async function deleteReminder(d:Device,id:string){
 if(!UUID.test(id))throw Error('Hatırlatma geçersiz.');
 const old=await db().prepare('SELECT media_id FROM reminders WHERE id=? AND device=?').bind(id,d.id).first<{media_id:string|null}>();
 await db().batch([db().prepare('DELETE FROM reminders WHERE id=? AND device=?').bind(id,d.id),db().prepare("UPDATE events SET status='cancelled' WHERE device=? AND group_id=? AND status IN ('pending','sending')").bind(d.id,'custom:'+id)]);
 if(old?.media_id)await removeMedia(d,old.media_id).catch(()=>{});
}
export async function validReminderEvent(id:string,device:string,revision:number){return !!await db().prepare('SELECT id FROM reminders WHERE id=? AND device=? AND revision=?').bind(id,device,revision).first();}

export function detectMedia(bytes:Uint8Array){
 const is=(s:number[])=>s.every((v,i)=>bytes[i]===v),ascii=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
 if(is([137,80,78,71,13,10,26,10]))return 'image/png';
 if(is([255,216,255]))return 'image/jpeg';
 if(['GIF87a','GIF89a'].includes(ascii(0,6)))return 'image/gif';
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return 'image/webp';
 if(ascii(4,8)==='ftyp'&&bytes.length>=24){const brands=ascii(8,Math.min(bytes.length,40));if(/qt  /.test(brands))return 'video/quicktime';if(/isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV/.test(brands))return 'video/mp4';}
 throw Error('PNG, JPG, GIF, WebP, MP4 veya MOV dosyası seç.');
}
async function readFile(req:Request){
 if(!req.body||Number(req.headers.get('content-length')||0)>MAX_MEDIA_BYTES)throw Error('Dosya en fazla 10 MB olabilir.');
 const reader=req.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_MEDIA_BYTES){await reader.cancel();throw Error('Dosya en fazla 10 MB olabilir.');}chunks.push(value);}}finally{reader.releaseLock();}
 if(size<12)throw Error('Dosya okunamadı.');const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function uploadMedia(d:Device,req:Request){
 const bytes=await readFile(req),type=detectMedia(bytes),id=crypto.randomUUID();let name='Dosya';try{name=decodeURIComponent(req.headers.get('x-file-name')||'Dosya').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,180)||'Dosya';}catch{}
 // Reserve storage atomically before uploading, including concurrent requests.
 const result=await db().prepare('INSERT INTO reminder_media(id,device,name,type,size,created) SELECT ?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(size),0) FROM reminder_media WHERE device=?) + ? <= ? AND (SELECT COUNT(*) FROM reminder_media WHERE device=?)<100').bind(id,d.id,name,type,bytes.length,Date.now(),d.id,bytes.length,100*1024*1024,d.id).run();
 if(!result.meta.changes)throw Error('Dosya alanın dolu. Kullanmadığın dosyalı hatırlatmaları sil.');
 try{await bucket().put(id,bytes,{httpMetadata:{contentType:type}});}catch(error){await db().prepare('DELETE FROM reminder_media WHERE id=? AND device=?').bind(id,d.id).run();throw error;}
 return {id,name,type,size:bytes.length,url:mediaUrl(id)};
}
export async function removeMedia(d:Device,id:string){
 return removeUnusedMedia(d.id,id);
}
async function removeUnusedMedia(device:string,id:string){
 if(!UUID.test(id))throw Error('Dosya geçersiz.');
 const deleted=await db().prepare('DELETE FROM reminder_media WHERE id=? AND device=? AND NOT EXISTS(SELECT 1 FROM reminders WHERE media_id=?) RETURNING id').bind(id,device,id).first<{id:string}>();if(deleted)await bucket().delete(id);
}
export async function cleanupMedia(){
 const rows=(await db().prepare('SELECT id,device FROM reminder_media WHERE created<? AND NOT EXISTS(SELECT 1 FROM reminders WHERE media_id=reminder_media.id) LIMIT 10').bind(Date.now()-86400000).all<{id:string;device:string}>()).results;
 for(const row of rows)await removeUnusedMedia(row.device,row.id);
}
export async function getMedia(req:Request,id:string){
 if(!UUID.test(id))return new Response(null,{status:404});
 // Random, unlisted media URLs also work for OS notification image fetches.
 const media=await db().prepare('SELECT * FROM reminder_media WHERE id=?').bind(id).first<MediaRow>();if(!media)return new Response(null,{status:404});
 const headers=new Headers({'Content-Type':media.type,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Referrer-Policy':'no-referrer','Accept-Ranges':'bytes'});
 let start=0,end=media.size-1,status=200;const range=req.headers.get('range');
 if(range){const match=range.match(/^bytes=(\d*)-(\d*)$/);if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${media.size}`}});
  start=match[1]?Number(match[1]):Math.max(0,media.size-Number(match[2]));end=match[1]&&match[2]?Math.min(Number(match[2]),end):end;
  if(start> end||start<0||start>=media.size||!Number.isSafeInteger(start)||!Number.isSafeInteger(end))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${media.size}`}});
  status=206;headers.set('Content-Range',`bytes ${start}-${end}/${media.size}`);
 }
 headers.set('Content-Length',String(end-start+1));
 if(req.method==='HEAD')return new Response(null,{status,headers});
 const object=await bucket().get(id,status===206?{range:{offset:start,length:end-start+1}}:undefined);if(!object)return new Response(null,{status:404});
 return new Response(object.body,{status,headers});
}
