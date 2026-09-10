'use client';
import {memo,useEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {LoaderCircle,MapPin} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Combobox,ComboboxContent,ComboboxItem,ComboboxInput,ComboboxList,ComboboxEmpty} from '@/components/ui/combobox';
import {locationKey,type LocationOption,type DistrictChoices} from '@/lib/location';
import type {Settings} from '@/lib/model';

const cache=new Map<string,{at:number;value:unknown}>();
const pending=new Map<string,Promise<unknown>>();
async function choices<T>(path:string,force=false):Promise<T>{
 const old=cache.get(path);if(!force&&old&&Date.now()-old.at<5*60000)return old.value as T;
 const key=path+(force?'&refresh=1':'');
 const running=pending.get(key);if(running)return running as Promise<T>;
 const task=(async()=>{const res=await fetch('/api/locations?'+key,{signal:AbortSignal.timeout(20000)});const value=await res.json() as T & {error?:string};if(!res.ok)throw Error(value.error||'Konum listesi alınamadı.');cache.set(path,{at:Date.now(),value});return value;})();
 pending.set(key,task);try{return await task;}finally{pending.delete(key);}
}
function Pick({value,onChange,options,label,disabled,portalContainer}:{value:string;onChange:(x:string)=>void;options:LocationOption[];label:string;disabled?:boolean;portalContainer:RefObject<HTMLDivElement|null>}){
 const index=useMemo(()=>({names:options.map(x=>x.name),byName:new Map(options.map(x=>[x.name,x])),byId:new Map(options.map(x=>[x.id,x])),search:new Map(options.map(x=>[x.name,[x.name,...(x.aliases||[])].map(locationKey).join('\n')]))}),[options]);
 return <Combobox items={index.names} disabled={disabled} value={index.byId.get(value)?.name||null} filter={(item,query)=>(index.search.get(item)||'').includes(locationKey(query))} onValueChange={name=>{const item=index.byName.get(name||'');if(item)onChange(item.id);}}><ComboboxInput className="location-input" disabled={disabled} aria-label={label} placeholder={label}/><ComboboxContent portalContainer={portalContainer} className="location-options"><ComboboxEmpty>Sonuç bulunamadı.</ComboboxEmpty><ComboboxList>{(item:string)=><ComboboxItem key={item} value={item}>{item}</ComboboxItem>}</ComboboxList></ComboboxContent></Combobox>;
}

export default memo(function LocationDialog({open,onOpenChange,settings,onSave,busy}:{open:boolean;onOpenChange:(x:boolean)=>void;settings:Settings;onSave:(patch:Partial<Settings>)=>Promise<void>;busy:boolean}){
 const container=useRef<HTMLDivElement|null>(null),initial=useRef(settings);
 const [city,setCity]=useState(settings.cityId),[district,setDistrict]=useState(''),[area,setArea]=useState(''),[region,setRegion]=useState('');
 const [cities,setCities]=useState<LocationOption[]>([]),[list,setList]=useState<DistrictChoices>({districts:[],areas:[]});
 const [cityLoading,setCityLoading]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[saving,setSaving]=useState(false);
 useEffect(()=>{if(open){initial.current=settings;setCity(settings.cityId);setDistrict(settings.adminDistrictId||'');setArea(settings.districtId);setRegion(settings.regionName||'');setError('');setRetry(0);}},[open]);
 useEffect(()=>{if(!open)return;let alive=true;setCityLoading(true);choices<LocationOption[]>('',retry>0).then(x=>{if(alive)setCities(x);}).catch(()=>{if(alive)setError('İller yüklenemedi. Bağlantını kontrol edip yeniden dene.');}).finally(()=>{if(alive)setCityLoading(false);});return()=>{alive=false;};},[open,retry]);
 useEffect(()=>{
  if(!open||!city)return;let alive=true;setLoading(true);setList({districts:[],areas:[]});
  choices<DistrictChoices>('city='+encodeURIComponent(city)+'&administrative=1',retry>0).then(x=>{
   if(!alive)return;setList(x);
   setDistrict(current=>{
    if(x.districts.some(d=>d.id===current))return current;
    const old=initial.current;
    return city===old.cityId?(x.districts.find(d=>locationKey(d.name)===locationKey(old.districtName))?.id||''):'';
   });
  }).catch(()=>{if(alive)setError('İlçeler yüklenemedi. Bağlantını kontrol edip yeniden dene.');}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[open,city,retry]);
 const selected=list.districts.find(x=>x.id===district),prayerId=selected?.prayerId||area,prayerArea=list.areas.find(x=>x.id===prayerId);
 const changeCity=(id:string)=>{setCity(id);setDistrict('');setArea('');setRegion('');setError('');};
 const changeDistrict=(id:string)=>{setDistrict(id);setArea('');setRegion('');setError('');};
 const submit=async()=>{if(!selected||!prayerArea||saving||busy)return;setSaving(true);setError('');try{await onSave({cityId:city,adminDistrictId:district,districtId:prayerId,regionName:region});onOpenChange(false);}catch(e){setError((e as Error).message);}finally{setSaving(false);}};
 return <Dialog open={open} onOpenChange={value=>{if(!saving)onOpenChange(value);}}><DialogContent ref={container} className="app-dialog location-dialog"><div className="location-dialog-body">
  <DialogHeader><DialogTitle>Bugün neredesin?</DialogTitle><DialogDescription>İlini, ilçeni ve istersen mahalleni seç. Namaz hatırlatmaların seçtiğin takvime göre güncellenir.</DialogDescription></DialogHeader>
  <label className="field">İl<Pick label={cityLoading?'İller yükleniyor…':'İl ara veya seç'} value={city} options={cities} disabled={cityLoading||saving||!cities.length} portalContainer={container} onChange={changeCity}/></label>
  <label className="field">İlçe<Pick label={loading?'İlçeler yükleniyor…':'İlçe ara veya seç'} value={district} options={list.districts} disabled={loading||saving||!list.districts.length} portalContainer={container} onChange={changeDistrict}/></label>
  <label className="field">Mahalle / bölge <span className="muted">İsteğe bağlı</span><input aria-label="Mahalle veya bölge" value={region} maxLength={80} placeholder="Örn. Eryaman" autoComplete="off" disabled={!selected||saving} onChange={e=>setRegion(e.target.value)}/></label>
  {city==='506'&&district==='1922'&&region!=='Eryaman'&&<button type="button" className="region-suggestion" disabled={saving} onClick={()=>setRegion('Eryaman')}>Eryaman</button>}
  {selected&&!selected.prayerId&&<><p className="small muted">{selected.name} için serviste ayrı takvim yok. Kullanmak istediğin vakit bölgesini seç.</p><label className="field">Namaz takvimi<Pick label="Vakit bölgesini seç" value={area} options={list.areas} disabled={saving} portalContainer={container} onChange={setArea}/></label></>}
  {selected&&prayerArea&&<div className="location-calendar"><b>Namaz takvimi: {prayerArea.name}</b><span>{locationKey(selected.name)!==locationKey(prayerArea.name)?`${selected.name} için ${prayerArea.name} takvimi kullanılacak. `:''}Mahalle / bölge adı ayrı bir vakit hesabı oluşturmaz.</span></div>}
  {error&&<div role="alert" className="notice error"><span>{error}</span><button disabled={cityLoading||loading||saving} onClick={()=>{setError('');setRetry(x=>x+1);}}>Yeniden dene</button></div>}
  <button className="primary full" disabled={busy||saving||cityLoading||loading||!selected||!prayerArea} onClick={submit}>{saving?<LoaderCircle className="spin" size={17}/>:<MapPin size={17}/>}Konumu güncelle</button>
 </div></DialogContent></Dialog>;
});
