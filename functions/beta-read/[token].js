const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export async function onRequest({request,env,params}){
 const token=String(params.token||"");
 if(!/^[a-f0-9]{64}$/i.test(token))return new Response("Not found",{status:404});
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
 const hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("");
 const url="https://jrfxgpkpbacajhcwimgz.supabase.co/rest/v1/snippet_beta_reads?select=title,author_username,status&share_token_hash=eq."+hash;
 const res=await fetch(url,{headers:{apikey:"sb_publishable_FnVMe0O37DKb87PCYdg6-g_DbI28pcE",Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY}});
 if(!res.ok)return new Response("Unavailable",{status:503});
 const [book]=await res.json();
 if(!book||book.status!=="active")return new Response("Not found",{status:404});
 const title=esc(book.title),author=esc(book.author_username);
 const destination="/applications/editor/pages/beta-read.html?token="+token;
 const description=esc("Read "+book.title+" by "+book.author_username+" and share your feedback on Alysum Writing.");
 return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>${title} · Beta Read</title><meta name="description" content="${description}"><meta property="og:type" content="website"><meta property="og:site_name" content="Alysum Writing"><meta property="og:title" content="${title} · Beta Read invitation"><meta property="og:description" content="${description}"><meta property="og:image" content="https://alysumwriting.com/Alysum-3.png"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${title} · Beta Read invitation"><meta name="twitter:description" content="${description}"><meta name="theme-color" content="#241b30"><meta http-equiv="refresh" content="0;url=${destination}"></head><body style="background:#17151e;color:#f7f0ff;font:18px system-ui;text-align:center;padding:10vh 20px"><h1>${title}</h1><p>By ${author}</p><p>You're invited to beta read on Alysum Writing.</p><a style="color:#dcc7ff" href="${destination}">Open invitation</a></body></html>`,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}
