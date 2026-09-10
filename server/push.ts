// Standards-based Web Push: RFC 8291 (aes128gcm) and RFC 8292 (VAPID).
const enc=new TextEncoder();
export const b64=(v:Uint8Array)=>btoa(String.fromCharCode(...v)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export function un64(s:string){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
function join(...parts:Uint8Array[]){const out=new Uint8Array(parts.reduce((s,p)=>s+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;}
async function hmac(key:Uint8Array,data:Uint8Array){const k=await crypto.subtle.importKey('raw',key as BufferSource,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,data as BufferSource));}
async function expand(prk:Uint8Array,info:Uint8Array,len:number){return (await hmac(prk,join(info,new Uint8Array([1])))).slice(0,len);}
export async function generateVapid(){const k=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']) as CryptoKeyPair;return {private:await crypto.subtle.exportKey('jwk',k.privateKey),public:b64(new Uint8Array(await crypto.subtle.exportKey('raw',k.publicKey)))};}
export type Subscription={endpoint:string;keys:{p256dh:string;auth:string}};
export function validateSubscription(x:unknown):Subscription{
 const s=x as Subscription;let u:URL;try{u=new URL(s.endpoint);}catch{throw Error('Bildirim adresi geçersiz.');}
 // Permit only established push services; no caller-selected arbitrary fetch targets.
 const host=u.hostname;
 if(u.protocol!=='https:'||u.port||u.username||u.password||!(host.endsWith('.push.apple.com')||host==='fcm.googleapis.com'||host.endsWith('.notify.windows.com')||host==='updates.push.services.mozilla.com'))throw Error('Desteklenmeyen bildirim servisi.');
 if(!s.keys||typeof s.keys.p256dh!=='string'||typeof s.keys.auth!=='string'||s.endpoint.length>2048||un64(s.keys.p256dh).length!==65||un64(s.keys.auth).length!==16)throw Error('Bildirim anahtarı geçersiz.');return {endpoint:s.endpoint,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}};
}
export async function encryptPayload(s:Subscription,payload:string){
 const client=un64(s.keys.p256dh),auth=un64(s.keys.auth);
 const ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']) as CryptoKeyPair;
 const pub=new Uint8Array(await crypto.subtle.exportKey('raw',ephemeral.publicKey));
 const remote=await crypto.subtle.importKey('raw',client,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:remote},ephemeral.privateKey,256));
 const prkKey=await hmac(auth,shared);
 const ikm=await expand(prkKey,join(enc.encode('WebPush: info\0'),client,pub),32);
 const salt=crypto.getRandomValues(new Uint8Array(16));const prk=await hmac(salt,ikm);
 const cek=await expand(prk,enc.encode('Content-Encoding: aes128gcm\0'),16);
 const nonce=await expand(prk,enc.encode('Content-Encoding: nonce\0'),12);
 const body=enc.encode(payload);if(body.length>3800)throw Error('Bildirim çok uzun.');
 const aes=await crypto.subtle.importKey('raw',cek,{name:'AES-GCM'},false,['encrypt']);
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},aes,join(body,new Uint8Array([2]))));
 // Record size 4096, key ID length 65.
 return join(salt,new Uint8Array([0,0,16,0,65]),pub,cipher);
}
export async function sendPush(s:Subscription,payload:unknown,vapid:{private:JsonWebKey;public:string},subject:string,ttl=120){
 const header=b64(enc.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
 const claims=b64(enc.encode(JSON.stringify({aud:new URL(s.endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:subject})));
 const key=await crypto.subtle.importKey('jwk',vapid.private,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const sig=b64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(header+'.'+claims))));
 const body=await encryptPayload(s,JSON.stringify(payload));
 return fetch(s.endpoint,{method:'POST',headers:{Authorization:`vapid t=${header}.${claims}.${sig}, k=${vapid.public}`,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:String(Math.max(0,Math.min(900,ttl))),Urgency:'high'},body,redirect:'error',signal:AbortSignal.timeout(12000)});
}
