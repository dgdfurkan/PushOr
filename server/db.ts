import {env} from 'cloudflare:workers';
export function db():D1Database {const d=(env as unknown as {DB?:D1Database}).DB;if(!d)throw Error('Kayıt servisine şu an ulaşılamıyor.');return d;}
export function runtime(){return env as unknown as Record<string,string>;}
export function bucket():R2Bucket {const b=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;if(!b)throw Error('Dosya servisi şu an kullanılamıyor. Dosyasız kaydedebilir veya yeniden deneyebilirsin.');return b;}
export async function kvGet(key:string){return db().prepare('SELECT value,updated FROM kv WHERE key=?').bind(key).first<{value:string;updated:number}>();}
export async function kvSet(key:string,value:unknown){await db().prepare('INSERT INTO kv(key,value,updated) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated=excluded.updated').bind(key,JSON.stringify(value),Date.now()).run();}
