export type LocationOption = {id:string; name:string; aliases?:string[]};
export type DistrictOption = LocationOption & {prayerId?:string; prayerAreaName?:string};
export type DistrictChoices = {districts:DistrictOption[]; areas:LocationOption[]};

// Match both Turkish and ASCII spellings without relying on the browser locale.
export function locationKey(value:string) {
 return value.trim().replace(/[ıİ]/g,'i').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
}
