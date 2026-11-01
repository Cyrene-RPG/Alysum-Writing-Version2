/** Thin Vercel adapter; Cloudflare uses functions/api/purchase-passes.js. */
module.exports=async(req,res)=>{
 try{
  const {handlePurchasePasses}=await import('../core/server/http-handlers/purchase-passes.mjs');
  const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):String(value));
  let body;if(!['GET','HEAD'].includes(req.method)){
   if(req.body!==undefined)body=typeof req.body==='string'||Buffer.isBuffer(req.body)?req.body:JSON.stringify(req.body);
   else{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>32768){res.statusCode=413;res.end('Request too large');return;}chunks.push(chunk);}body=Buffer.concat(chunks);}
  }
  const response=await handlePurchasePasses(new Request('https://'+req.headers.host+req.url,{method:req.method,headers,body}),process.env);
  res.statusCode=response.status;for(const [key,value]of response.headers)res.setHeader(key,value);res.end(await response.text());
 }catch{res.statusCode=503;res.setHeader('Cache-Control','private, no-store');res.end('Purchase Passes are temporarily unavailable.');}
};
