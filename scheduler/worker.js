// Gün Akışı companion scheduler. Deploy the scheduler directory with Workers Builds.
// The connection key belongs in Settings → Variables and Secrets, never here.
const DEFAULT_SITE_ORIGIN = 'https://gun-akisi.gunduz.chatgpt.site';
const VERSION = '2026-09-10.3';

function siteOrigin(env) {
  const raw = String(env.SITE_ORIGIN || DEFAULT_SITE_ORIGIN).trim().replace(/\/+$/, '');
  let url;
  try { url = new URL(raw); } catch { throw new Error('SITE_ORIGIN geçerli bir site adresi değil.'); }
  if (url.protocol !== 'https:' || url.origin !== raw || url.username || url.password) {
    throw new Error('SITE_ORIGIN yalnızca https:// ile başlayan ana site adresi olmalı; sonuna /api/tick ekleme.');
  }
  return url.origin;
}

function config(env) {
  const secret = String(env.CRON_SECRET || '').trim();
  if (secret.length < 32) throw new Error('CRON_SECRET eksik. Settings → Variables and Secrets bölümünden Secret olarak ekle.');
  return { secret, origin: siteOrigin(env) };
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}
async function matches(a, b) {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}

async function tick(env, trigger) {
  const { secret, origin } = config(env);
  const response = await fetch(origin + '/api/tick', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + secret, 'X-Gun-Akisi-Trigger': trigger },
    // The deployed Workers runtime accepts manual/follow, but rejects error.
    // Never forward the connection key to a redirect destination.
    redirect: 'manual',
    signal: AbortSignal.timeout(50000),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error('Uygulama adresi başka bir adrese yönlendiriyor. SITE_ORIGIN değerini kontrol et.');
  }
  if (!response.ok) {
    const messages = {
      401: 'Bağlantı anahtarı eşleşmiyor. CRON_SECRET değerini yeniden kontrol et.',
      403: 'Site isteği engelledi. Sitenin herkese açık olduğunu kontrol et.',
      503: 'Uygulama tarafındaki zamanlayıcı ayarı henüz hazır değil.',
    };
    throw new Error(messages[response.status] || 'Uygulamaya ulaşılamadı. HTTP ' + response.status);
  }
  let result;
  try { result = await response.json(); } catch { throw new Error('Adres API yerine farklı bir sayfa döndürdü. SITE_ORIGIN değerini kontrol et.'); }
  if (!result || ![result.sent, result.checked, result.at].every(x => typeof x === 'number' && Number.isFinite(x))) {
    throw new Error('Uygulamadan beklenen bağlantı yanıtı alınamadı.');
  }
  return { ok: true, trigger, sent: result.sent, checked: result.checked, at: result.at };
}

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

function setupPage(origin) {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  return new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gün Akışı · Bağlantı kontrolü</title><style>
  *{box-sizing:border-box}body{font:16px/1.65 system-ui;margin:0;padding:32px 20px;background:#f6f7f9;color:#302a3b}main{max-width:470px;margin:8vh auto;background:#fff;border:1px solid #e6e0eb;padding:28px;border-radius:22px}h1{font-size:26px;line-height:1.3;letter-spacing:-.6px}p{color:#74697e}label{display:block;margin-top:25px}input,button{width:100%;font:inherit;border-radius:12px;padding:12px 14px}input{border:1px solid #dcd5e5;margin:8px 0 15px}button{border:0;color:white;background:#6540ca;cursor:pointer}button:disabled{opacity:.55}output{display:block;margin-top:22px;white-space:pre-line}small{display:block;font-size:13px;color:#8c7b98;margin-top:17px}a{color:#6540ca}
  </style></head><body><main><h1>Bağlantıyı kontrol edelim.</h1><p>Bu, bildirim servisinin kurulum ekranı. Günlük planın için <a href="${origin}">Gün Akışı uygulamasını aç</a>.</p><p>Cloudflare’a kaydettiğin bağlantı anahtarını gir. Anahtar bu ekranda saklanmaz.</p><form id="test"><label for="secret">Bağlantı anahtarı</label><input id="secret" name="secret" type="password" autocomplete="off" spellcheck="false" required minlength="32"><button id="send">Bağlantıyı dene</button></form><output id="result" aria-live="polite"></output><small>Zamanı gelmiş bildirimler varsa bu test onları da gönderir. Bu testin başarılı olması, dakikalık zamanlamanın kurulduğu anlamına gelmez.</small><p><a href="${origin}/?view=settings">Gün Akışı ayarlarını aç</a></p></main><script nonce="${nonce}">
  document.getElementById('test').addEventListener('submit',async event=>{
    event.preventDefault();const field=document.getElementById('secret'),button=document.getElementById('send'),result=document.getElementById('result');let key=field.value.trim();field.value='';button.disabled=true;result.textContent='Bağlantı deneniyor…';
    try{const response=await fetch('/run',{method:'POST',headers:{Authorization:'Bearer '+key},redirect:'error'});key='';const data=await response.json();if(!response.ok)throw Error(data.error||'Bağlantı kurulamadı.');result.textContent='Bağlantı tamam. '+data.sent+' bildirim gönderildi.\\nGün Akışı, ilk otomatik çalışmadan sonra zamanlayıcıyı etkin gösterecek. Yeni zamanlamanın devreye girmesi 15 dakikayı bulabilir.';}
    catch(error){result.textContent=error.message||'Bağlantı kurulamadı.';}finally{key='';button.disabled=false;}
  });</script></body></html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
    },
  });
}

export default {
  async scheduled(controller, env, ctx) {
    // Await the actual result so failed scheduled executions are visible in Cloudflare.
    const result = await tick(env, 'cron');
    console.log(JSON.stringify({ event: 'gun-akisi-tick', ...result }));
  },
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    // Opening the Worker is a normal app visit; diagnostics are opt-in at /setup.
    if ((request.method === 'GET' || request.method === 'HEAD') && path === '/') {
      try {
        return new Response(null, { status: 302, headers: {
          Location: siteOrigin(env) + '/', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
        } });
      } catch (error) { return json({ error: error.message }, 503); }
    }
    if (request.method === 'GET' && path === '/setup') {
      try { return setupPage(siteOrigin(env)); }
      catch (error) { return json({ error: error.message }, 503); }
    }
    if (request.method === 'GET' && (path === '/health' || path === '/api/health')) {
      try { config(env); return json({ version: VERSION, configured: true, note: 'Bu yalnızca ayar kontrolüdür; otomatik çalışmayı doğrulamaz.' }); }
      catch (error) { return json({ version: VERSION, configured: false, error: error.message }, 503); }
    }
    if (path !== '/run') return json({ error: 'Bulunamadı.' }, 404);
    if (request.method !== 'POST') return json({ error: 'POST gerekli.' }, 405);
    if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'İstek engellendi.' }, 403);
    try {
      const { secret } = config(env);
      const supplied = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
      if (supplied.length > 256 || !await matches(supplied, secret)) return json({ error: 'Bağlantı anahtarı yanlış.' }, 401);
      return json(await tick(env, 'manual'));
    } catch (error) {
      return json({ error: error.name === 'TimeoutError' ? 'Uygulama zamanında yanıt vermedi. Birazdan yeniden dene.' : error.message || 'Bağlantı kurulamadı.' }, 502);
    }
  },
};
