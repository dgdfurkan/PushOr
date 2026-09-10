import assert from 'node:assert/strict';
import worker from '../scheduler/worker.js';

const secret = 'test-only-connection-key-0000000000000000000000000000000';
const env = { CRON_SECRET: secret };
const origin = 'https://scheduler.example';
const request = (path, method = 'GET', key, extra = {}) => new Request(origin + path, {
  method, headers: { ...(key ? { Authorization: 'Bearer ' + key } : {}), ...extra },
});
const originalFetch = globalThis.fetch;
const calls = [];
let response = () => Response.json({ sent: 0, checked: 0, at: Date.now() });
globalThis.fetch = async (url, options) => {
  // Reproduce the live Workers restriction that Node's fetch does not enforce.
  if (options.redirect === 'error') throw new TypeError('Invalid redirect value: error');
  calls.push({ url, options }); return response();
};
try {
  const page = await worker.fetch(request('/'), env);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert(!html.includes(secret));
  // Validate the actual inline JS, including the newline inside the template literal.
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
  new Function(script);
  assert.equal((await worker.fetch(request('/health'), {})).status, 503);
  const healthAlias=await worker.fetch(request('/api/health'), env);
  assert.equal(healthAlias.status,200);
  assert.equal((await healthAlias.json()).configured,true);
  assert.equal((await worker.fetch(request('/health'), { ...env, SITE_ORIGIN: 'https://example.com/api/tick' })).status, 503);
  assert.equal((await worker.fetch(request('/health'), { ...env, SITE_ORIGIN: 'http://example.com' })).status, 503);
  assert.equal((await worker.fetch(request('/run', 'POST'), env)).status, 401);
  assert.equal((await worker.fetch(request('/run', 'POST', 'wrong'), env)).status, 401);
  assert.equal((await worker.fetch(request('/run', 'POST', secret, { 'sec-fetch-site': 'cross-site' }), env)).status, 403);
  assert.equal((await worker.fetch(request('/run'), env)).status, 405);
  assert.equal(calls.length, 0, 'invalid requests must never invoke the app');

  const manual = await worker.fetch(request('/run', 'POST', secret), env);
  assert.deepEqual({ ...(await manual.json()), at: 0 }, { ok: true, trigger: 'manual', sent: 0, checked: 0, at: 0 });
  assert.equal(calls[0].url, 'https://gun-akisi.gunduz.chatgpt.site/api/tick');
  assert.equal(calls[0].options.headers['X-Gun-Akisi-Trigger'], 'manual');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + secret);
  assert.equal(calls[0].options.redirect, 'manual');
  await worker.scheduled({}, env, {});
  assert.equal(calls.at(-1).options.headers['X-Gun-Akisi-Trigger'], 'cron');

  const beforeRedirect = calls.length;
  response = () => new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/' } });
  const redirected = await worker.fetch(request('/run', 'POST', secret), env);
  assert.equal(redirected.status, 502);
  assert.match((await redirected.json()).error, /yönlendiriyor/);
  assert.equal(calls.length, beforeRedirect + 1, 'must not follow a redirect with the connection key');

  response = () => new Response('unauthorized detail never echoed', { status: 401 });
  const denied = await worker.fetch(request('/run', 'POST', secret), env);
  assert.equal(denied.status, 502);
  assert.match((await denied.json()).error, /eşleşmiyor/);
  await assert.rejects(worker.scheduled({}, env, {}), /eşleşmiyor/);
  response = () => Response.json(null);
  assert.match((await (await worker.fetch(request('/run', 'POST', secret), env)).json()).error, /beklenen bağlantı/);
  response = () => new Response('<html>not the API</html>');
  assert.match((await (await worker.fetch(request('/run', 'POST', secret), env)).json()).error, /SITE_ORIGIN/);
  response = () => { throw new DOMException('timeout', 'TimeoutError'); };
  assert.match((await (await worker.fetch(request('/run', 'POST', secret), env)).json()).error, /zamanında/);
  console.log('Scheduler checks passed: authentication, configuration, manual/cron separation, error propagation, setup script.');
} finally { globalThis.fetch = originalFetch; }
