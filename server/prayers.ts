import {kvGet,kvSet} from './db';
import {dateTR,type PrayerDay} from '../lib/model';
const BASE='https://ezanvakti.emushaf.net';
export const source={name:'Diyanet verisi · EzanVakti API',url:BASE,official:'https://namazvakitleri.diyanet.gov.tr/'};
async function cached(path:string,maxAge:number,force=false){
 const old=await kvGet('prayer:'+path);
 if(!force&&old&&Date.now()-old.updated<maxAge)return JSON.parse(old.value);
 try{
 const res=await fetch(BASE+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(!res.ok)throw Error('Vakit servisi yanıt vermedi.');
 const json=await res.json();if(!Array.isArray(json)||json.length===0)throw Error('Vakit servisi boş veri döndürdü.');
 await kvSet('prayer:'+path,json);return json;
 }catch(e){if(old)return JSON.parse(old.value);throw e;}
}
export async function cities(){return (await cached('/sehirler/2',86400000*7)).map((x:any)=>({id:x.SehirID,name:x.SehirAdi}));}
export async function districts(id:string){if(!/^\d{1,8}$/.test(id))throw Error('İl seçimi geçersiz.');return (await cached('/ilceler/'+id,86400000*7)).map((x:any)=>({id:x.IlceID,name:x.IlceAdi}));}
export async function defaultDistrict(){const list=await districts('506');const item=list.find((x:any)=>x.name.toLocaleUpperCase('tr-TR')==='ETİMESGUT');if(!item)throw Error('Etimesgut vakitleri bulunamadı. Konumu tekrar seçebilirsin.');return item.id;}
export async function prayerDays(id:string):Promise<PrayerDay[]>{
 if(!/^\d{1,8}$/.test(id))throw Error('İlçe seçilmedi.');
 let raw=await cached('/vakitler/'+id,6*3600000);
 const todayKey=dateTR().split('-').reverse().join('.');
 if(!raw.some((x:any)=>x.MiladiTarihKisa===todayKey))raw=await cached('/vakitler/'+id,6*3600000,true);
 return raw.map((x:any)=>{
 const parts=String(x.MiladiTarihKisa).split('.');const date=parts.length===3?`${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`:'';
 const p={date,imsak:x.Imsak,sunrise:x.Gunes,noon:x.Ogle,afternoon:x.Ikindi,sunset:x.Aksam,night:x.Yatsi};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Object.entries(p).filter(([k])=>k!=='date').every(([,v])=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v as string)))return null;
 const values=[p.imsak,p.sunrise,p.noon,p.afternoon,p.sunset,p.night];if(!values.every((v,i)=>i===0||v>values[i-1]))return null;
 return p;
 }).filter((x:PrayerDay|null)=>x&&x.date>=dateTR(Date.now()-86400000)).sort((a:PrayerDay,b:PrayerDay)=>a.date.localeCompare(b.date));
}
