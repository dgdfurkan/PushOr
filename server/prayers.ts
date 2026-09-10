import {kvGet,kvSet} from './db';
import {dateTR,type PrayerDay} from '../lib/model';
import {locationKey,type LocationOption} from '../lib/location';
const BASE='https://ezanvakti.emushaf.net';
export const source={name:'Diyanet verisi · EzanVakti API',url:BASE,official:'https://namazvakitleri.diyanet.gov.tr/'};
const pending=new Map<string,Promise<unknown>>();

async function cached<T>(path:string,maxAge:number,parse:(raw:unknown)=>T,force=false):Promise<T>{
 const key='prayer:v2:'+path,old=await kvGet(key);
 let previous:T|undefined;
 if(old){try{previous=parse(JSON.parse(old.value));}catch{/* Invalid and out-of-date cache entries are never used. */}}
 if(!force&&previous!==undefined&&Date.now()-old!.updated<maxAge)return previous;
 const running=pending.get(key);if(running)return running as Promise<T>;
 const request=(async()=>{
  try{
   const res=await fetch(BASE+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
   if(!res.ok)throw Error('Vakit servisine şu an ulaşılamıyor. Yeniden deneyebilirsin.');
   const raw=await res.json(),value=parse(raw);
   await kvSet(key,raw);return value;
  }catch(error){if(previous!==undefined)return previous;throw error;}
 })();
 pending.set(key,request);
 try{return await request;}finally{pending.delete(key);}
}

export function parseLocations(raw:unknown,kind:'city'|'district'):LocationOption[]{
 if(!Array.isArray(raw))throw Error('Konum listesi okunamadı. Yeniden deneyebilirsin.');
 const idKey=kind==='city'?'SehirID':'IlceID',nameKey=kind==='city'?'SehirAdi':'IlceAdi';
 const rows:LocationOption[]=raw.flatMap(x=>{
  if(!x||typeof x!=='object')return [];
  const id=String(x[idKey]??'').trim(),name=String(x[nameKey]??'').trim();
  return /^\d{1,8}$/.test(id)&&name?[{id,name}]:[];
 });
 const unique=[...new Map(rows.map(x=>[x.id,x])).values()];
 if(!unique.length)throw Error('Konum listesi boş geldi. Yeniden deneyebilirsin.');
 return unique.sort((a,b)=>a.name.localeCompare(b.name,'tr'));
}
export async function cities(force=false){return cached('/sehirler/2',7*86400000,raw=>parseLocations(raw,'city'),force);}
export async function districts(id:string,force=false){
 if(!/^\d{1,8}$/.test(id))throw Error('İl seçimi geçersiz.');
 const rows=await cached('/ilceler/'+id,7*86400000,raw=>parseLocations(raw,'district'),force);
 // The provider exposes Ankara's centre, not an independent Etimesgut record.
 return rows.map(x=>id==='506'&&locationKey(x.name)==='ankara'?{...x,aliases:['Etimesgut','Ankara merkez']}:x);
}
export async function defaultLocation(force=false){
 const rows=await districts('506',force);
 const exact=rows.find(x=>locationKey(x.name)==='etimesgut');
 const item=exact||rows.find(x=>locationKey(x.name)==='ankara');
 if(!item)throw Error('Ankara merkez takvimi alınamadı. Konum listesini yenileyebilirsin.');
 return {districtId:item.id,districtName:'Etimesgut',prayerAreaName:item.name};
}
export async function defaultDistrict(){return (await defaultLocation()).districtId;}

export function parsePrayerDays(raw:unknown,today=dateTR()):PrayerDay[]{
 if(!Array.isArray(raw))throw Error('Vakit verisi okunamadı. Yeniden deneyebilirsin.');
 const rows:PrayerDay[]=raw.flatMap(x=>{
  if(!x||typeof x!=='object')return [];
  const match=String(x.MiladiTarihKisa||'').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if(!match)return [];
  const date=`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;
  const stamp=Date.parse(date+'T12:00:00Z');
  if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==date||date<today)return [];
  const [imsak,sunrise,noon,afternoon,sunset,night]=[x.Imsak,x.Gunes,x.Ogle,x.Ikindi,x.Aksam,x.Yatsi].map(v=>String(v??'').trim());
  const times=[imsak,sunrise,noon,afternoon,sunset,night];
  if(!times.every((v,i)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v)&&(i===0||v>times[i-1])))return [];
  return [{date,imsak,sunrise,noon,afternoon,sunset,night}];
 });
 const unique=[...new Map(rows.map(x=>[x.date,x])).values()].sort((a,b)=>a.date.localeCompare(b.date));
 if(!unique.some(x=>x.date===today))throw Error('Bugünün namaz vakitleri servisten alınamadı. Yeniden deneyebilirsin.');
 return unique;
}
export async function prayerDays(id:string,force=false):Promise<PrayerDay[]>{
 if(!/^\d{1,8}$/.test(id))throw Error('İlçe seçilmedi.');
 return cached('/vakitler/'+id,6*3600000,parsePrayerDays,force);
}
