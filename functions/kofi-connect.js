const page = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ko-fi Shop · Alysum Writing</title>
<style>body{font:16px system-ui;max-width:660px;margin:2rem auto;padding:1rem;background:#141720;color:#f3f4f7}a{color:#c9afff}section{padding:1.3rem;border:1px solid #555b6c;border-radius:12px;margin:1rem 0}label{display:block;margin:1rem 0}input,select,button{font:inherit;padding:.7rem;width:100%;box-sizing:border-box}input,select{background:#242938;color:white;border:1px solid #72798b;border-radius:6px}button{background:#b99af3;border:0;border-radius:6px;cursor:pointer;font-weight:bold}button:disabled{opacity:.5}#status{white-space:pre-wrap}</style>
<h1>Connect your Ko-fi shop</h1><p><a href="/purchase-passes">Back to Purchase Passes</a></p>
<p>Connect your Ko-fi account once, then link products to Purchase Passes. You can activate a connected product after confirming your payment and email delivery setup.</p>
<p id="status" role="status">Checking sign-in…</p>
<div id="controls" hidden>
<section><h2>1. Ko-fi account</h2><p>Copy the verification token from your Ko-fi API / Webhooks settings. Keep it private.</p>
<label>Ko-fi verification token <input id="secret" type="password" autocomplete="off"></label>
<button id="account">Connect account</button>
<p>Ko-fi webhook URL: <code id="hook"></code></p></section>
<section><h2>2. Product connection</h2>
<label>Purchase Pass <select id="pass"></select></label>
<label>Ko-fi product link <input id="product" type="url" placeholder="https://ko-fi.com/s/1034cbe6ff"></label>
<label><input id="active" type="checkbox" style="width:auto"> Activate this Ko-fi product for automatic purchase-code delivery</label><button id="save">Save product connection</button><p id="existing"></p>
</section></div>
<script type="module">
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const supabase=createClient('https://jrfxgpkpbacajhcwimgz.supabase.co','sb_publishable_FnVMe0O37DKb87PCYdg6-g_DbI28pcE');
const el=id=>document.getElementById(id),status=s=>el('status').textContent=s;
el('hook').textContent=location.origin+'/api/kofi-webhook';
async function api(method,data){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session?.access_token)throw Error('Sign in to Alysum first, then reopen this page.');
 const res=await fetch('/api/kofi-products',{method,headers:{Authorization:'Bearer '+session.access_token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 const result=await res.json();if(!res.ok)throw Error(result.error||'Request failed');return result;
}
async function load(){
 const data=await api('GET');el('controls').hidden=false;el('pass').replaceChildren();
 for(const p of data.passes){const opt=document.createElement('option');opt.value=p.id;opt.textContent=p.title;el('pass').append(opt)}
 el('existing').textContent=data.mappings.map(m=>m.product_id+' ('+(m.enabled?'enabled':'inactive')+')').join(', ')||'No products connected.';
 el('save').disabled=!data.accountConnected||!data.passes.length;
 status(data.accountConnected?'Ko-fi account connected.':'Connect your Ko-fi account first.');
}
el('account').onclick=async()=>{try{el('account').disabled=true;await api('POST',{action:'connectAccount',verificationToken:el('secret').value});el('secret').value='';await load()}catch(e){status(e.message)}finally{el('account').disabled=false}};
el('save').onclick=async()=>{try{el('save').disabled=true;await api('POST',{passId:el('pass').value,productUrl:el('product').value,enabled:el('active').checked});await load();status(el('active').checked?'Product mapping activated. Confirm delivery worker is running before taking orders.':'Product mapping saved inactive.')}catch(e){status(e.message)}finally{el('save').disabled=false}};
load().catch(e=>status(e.message));
</script></html>`;
export const onRequestGet=()=>new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
