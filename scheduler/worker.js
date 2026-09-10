// Deploy this small companion Worker in your Cloudflare account.
// The Site owns the database and queue; this Worker only triggers a protected tick.
export default {
 async scheduled(controller,env,ctx){
  ctx.waitUntil((async()=>{
   const res=await fetch(env.SITE_ORIGIN+'/api/tick',{method:'POST',headers:{Authorization:'Bearer '+env.CRON_SECRET},signal:AbortSignal.timeout(50000)});
   if(!res.ok)throw new Error('Scheduler tick failed: '+res.status);
  })());
 },
 fetch(){return new Response('Gün Akışı zamanlayıcısı',{headers:{'Content-Type':'text/plain; charset=utf-8'}});}
};
