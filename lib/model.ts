export type Settings = {
 cityId: string; cityName: string; districtId: string; districtName: string; prayerAreaName?: string; adminDistrictId?: string; regionName?: string;
 bedtime: string; workStart: string; workEnd: string; sleepTarget: number;
 focusMinutes: number; breakMinutes: number; walkMinutes: number; bikeMinutes: number;
 offDays: string[]; gentleDays: string[]; skippedNaps: string[]; ingredients: string[];
 breakfast: number; reminders: boolean; recoverySleep: boolean;
};
export const defaults: Settings = {
 cityId:'506', cityName:'Ankara', districtId:'', districtName:'Etimesgut',
 bedtime:'02:15',workStart:'20:00',workEnd:'01:30',sleepTarget:7.5,
 focusMinutes:25,breakMinutes:5,walkMinutes:25,bikeMinutes:30,
 offDays:[],gentleDays:[],skippedNaps:[],ingredients:['Yumurta','Peynir','Domates','Ekmek','Yoğurt'],breakfast:0,reminders:true,recoverySleep:true
};
export type PrayerDay = {date:string; imsak:string; sunrise:string; noon:string; afternoon:string; sunset:string; night:string};
export type PlanEvent = {key:string;at:number;expires:number;kind:string;title:string;body:string;href:string;notify:boolean};
export type Session = {id:string;kind:string;started:number;ends:number;duration:number;elapsed:number;status:string;day:string};
export const minute=60000;
export function dateTR(ms=Date.now()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));}
export function at(date:string,time:string) {return Date.parse(`${date}T${time}:00+03:00`);}
export function clock(ms:number) {return new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'}).format(new Date(ms));}
export function addDays(date:string,n:number) {return new Date(at(date,'12:00')+n*86400000).toISOString().slice(0,10);}
export function humanMinutes(n:number) {return n>=60 ? `${Math.floor(n/60)} sa${Math.round(n%60)?' '+Math.round(n%60)+' dk':''}` : `${Math.round(n)} dk`;}
export function countdown(ms:number){const seconds=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(seconds/3600)).padStart(2,'0')} saat ${String(Math.floor(seconds%3600/60)).padStart(2,'0')} dakika ${String(seconds%60).padStart(2,'0')} saniye`;}
export function nextPrayer(days:PrayerDay[],now:number){return days.flatMap(p=>([['Sabah',p.imsak],['Öğle',p.noon],['İkindi',p.afternoon],['Akşam',p.sunset],['Yatsı',p.night]] as const).map(([name,time])=>({name,at:at(p.date,time)}))).filter(p=>p.at>now).sort((a,b)=>a.at-b.at)[0];}
export const recipes=[
 {title:'Kekikli yumurta tabağı',need:['Yumurta','Peynir','Domates'],detail:'Yumurta, peynir ve domates. Kekik, biraz zeytinyağı; varsa tam tahıllı ekmek.'},
 {title:'Peynirli domatesli tost',need:['Peynir','Domates','Ekmek'],detail:'Ekmeğe peynir ve domates ekle, tavada ısıt. Yanına su ve birkaç zeytin.'},
 {title:'Yoğurt ve yulaf kasesi',need:['Yoğurt','Yulaf'],detail:'Yoğurt ve yulafı karıştır. Varsa meyve ve birkaç ceviz ekle.'},
 {title:'Avokadolu peynirli ekmek',need:['Avokado','Peynir','Ekmek'],detail:'Avokadoyu ez, ekmeğe sür. Peynir ve kekikle tamamla.'},
 {title:'Domatesli yumurta',need:['Yumurta','Domates'],detail:'Domatesi tavada yumuşat, yumurtayı ekle. Yanına varsa peynir.'},
];
export function recipe(s:Settings) {const available=recipes.filter(r=>r.need.every(x=>s.ingredients.includes(x)));return available.length?available[s.breakfast%available.length]:null;}
export function sleepInfo(p:PrayerDay,s:Settings) {
 const wake=at(p.date,p.sunrise)-20*minute;
 let bed=at(p.date,s.bedtime);if(bed>=wake)bed-=86400000;
 const night=Math.max(0,(wake-bed)/minute);
 const recovery=Math.max(0,Math.ceil(s.sleepTarget*60-night));
 // A short nap is optional and never subtracted from the core sleep target.
 const start=at(p.date,p.sunrise)+60*minute;
 const end=start+recovery*minute;
 const fits=end<=at(p.date,p.noon)-30*minute;
 return {wake,bed,night,recovery,start,end,fits};
}
export function buildPlan(p:PrayerDay,s:Settings):PlanEvent[] {
 const d=p.date, rows:PlanEvent[]=[];
 const add=(key:string,t:number,kind:string,title:string,body:string,notify=true,ttl=10,href='today')=>rows.push({key:`${d}:${key}`,at:t,expires:t+ttl*minute,kind,title,body,notify,href});
 const si=sleepInfo(p,s), sun=at(d,p.sunrise), noon=at(d,p.noon), asr=at(d,p.afternoon), night=at(d,p.night);
 const off=s.offDays.includes(d),gentle=s.gentleDays.includes(d);
 add('imsak',at(d,p.imsak),'prayer','İmsak','Sabah namazı vakti başladı.',false);
 add('wake',si.wake,'prayer','Günaydın. Sabah namazı','Güneşin doğmasına 20 dakika var. Abdest ve namaz için kalkma zamanı.',true,10);
 add('move',si.wake+10*minute,'walk',gentle?'Bugün hafif bir başlangıç':'Biraz açık hava','Namazını bitirdiysen yürüyüş ya da bisiklet seç. Uykuluysan önce dinlen.',!gentle,15,'activity');
 add('sun',sun,'sun','Güneş doğuyor','Sabah namazı vaktinin sonu.',false);
 if(si.recovery>0&&s.recoverySleep&&si.fits){
 add('sleep-more',si.start,'sleep','Uykunu tamamla',`Gece planında ${humanMinutes(si.night)} uyku var. ${clock(si.end)} saatine kadar ek uyku için zaman ayır.`,true,20);
 add('recovery-end',si.end,'sun','Güne devam','Uyku bloğun sona erdi. İyi hissediyorsan biraz gün ışığı ve hafif hareket.',true,10);
 }
 for(const [key,label,t] of [['noon','Öğle',noon],['asr','İkindi',asr],['sunset','Akşam',at(d,p.sunset)],['night','Yatsı',night]] as const){
 add(key+'-before',t-5*minute,'prayer',`${label} namazına hazırlık`,`Hazırlanmak için kısa bir ara ver. Vakit ${clock(t)}.`,true,5);
 add(key,t,'prayer',`${label} vakti`,`${label} namazı vakti girdi.`,true,10);
 }
 if(!s.skippedNaps.includes(d))add('nap',noon+20*minute,'nap','20 dakika dinlenebilirsin','Öğle namazından sonra kısa bir şekerleme. Başlatınca süreni takip edeceğim.',true,40,'activity');
 else add('nap-skipped',noon+20*minute,'break','Bugün şekerleme yok','Kısa bir mola ver, biraz su iç. Uykuluysan yoğunluğu azalt; kısa mola eksik uykunun yerini tutmaz.',true,30);
 add('lunch',noon+55*minute,'food','Bir öğün arası','Akşama kadar aç kalma. Evdeki malzemelerle hafif bir öğün hazırla.',true,30);
 if(!off){
 add('work-prep',at(d,s.workStart)-30*minute,'work','İşe hazırlanma zamanı',`${s.workStart} vardiyası yaklaşıyor. Su ve yiyeceğini yanına al.`,true,20);
 add('work',at(d,s.workStart),'work','Vardiya başlıyor',`${s.workStart}–${s.workEnd}`,false);
 let end=at(d,s.workEnd); if(end<=at(d,s.workStart))end+=86400000;
 add('work-end',end,'home','Eve dönüş','Ellerini, yüzünü ve gerekirse ayaklarını yıka. Dişlerini fırçala, ışıkları kıs.',true,30);
 }
 // Bedtime belongs to the evening's shift, even when it is after midnight.
 let bed=at(d,s.bedtime); if(Number(s.bedtime.slice(0,2))<12)bed+=86400000;
 add('bed',bed,'sleep','Dinlenme zamanı','Ekranı bırak, ışıkları kıs. Sabah için telefon alarmını kontrol et.',true,25);
 add('recap',Math.min(bed-10*minute,at(d,'23:45')),'summary','Günün sende kalanları','Odak, mola ve hareket sürelerini günlük özetinde görebilirsin.',true,30,'summary');
 return rows.sort((a,b)=>a.at-b.at);
}
export function validateSettings(input:unknown,base:Settings):Settings {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Ayarlar okunamadı.');
 const o=input as Record<string,unknown>,s={...base};
 for(const k of ['cityId','districtId'] as const)if(k in o){if(typeof o[k]!=='string'||!/^\d{1,8}$/.test(o[k] as string))throw Error('İl ve ilçeyi listeden seç.');s[k]=o[k] as string;}
 for(const k of ['cityName','districtName'] as const)if(k in o){if(typeof o[k]!=='string'||!(o[k] as string).trim()||(o[k] as string).length>80)throw Error('Geçersiz konum.');s[k]=o[k] as string;}
 if('adminDistrictId' in o){if(typeof o.adminDistrictId!=='string'||!/^\d{0,8}$/.test(o.adminDistrictId))throw Error('İlçeyi listeden seç.');s.adminDistrictId=o.adminDistrictId;}
 if('regionName' in o){if(typeof o.regionName!=='string'||o.regionName.length>80||/[\u0000-\u001f\u007f]/.test(o.regionName))throw Error('Mahalle / bölge adı en fazla 80 karakter olabilir.');s.regionName=o.regionName.trim().replace(/\s+/g,' ');}
 for(const k of ['bedtime','workStart','workEnd'] as const)if(k in o){if(typeof o[k]!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(o[k] as string))throw Error('Saati kontrol et.');s[k]=o[k] as string;}
 for(const [k,min,max] of [['sleepTarget',7,10],['focusMinutes',10,90],['breakMinutes',3,30],['walkMinutes',10,90],['bikeMinutes',10,90]] as const)if(k in o){const v=o[k];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Süre izin verilen aralığın dışında.');s[k]=v;}
 for(const k of ['reminders','recoverySleep'] as const)if(k in o){if(typeof o[k]!=='boolean')throw Error('Ayar geçersiz.');s[k]=o[k] as boolean;}
 for(const k of ['offDays','gentleDays','skippedNaps'] as const)if(k in o){if(!Array.isArray(o[k])||(o[k] as unknown[]).length>60||!(o[k] as unknown[]).every(x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)))throw Error('Tarih listesi geçersiz.');s[k]=o[k] as string[];}
 if('ingredients' in o){const allowed=['Yumurta','Peynir','Domates','Ekmek','Yoğurt','Yulaf','Avokado'];if(!Array.isArray(o.ingredients)||!o.ingredients.every(x=>allowed.includes(x)))throw Error('Malzemeleri kontrol et.');s.ingredients=o.ingredients;}
 if('breakfast' in o){if(!Number.isInteger(o.breakfast)||Number(o.breakfast)<0||Number(o.breakfast)>100000)throw Error('Seçim geçersiz.');s.breakfast=Number(o.breakfast);}
 return s;
}
