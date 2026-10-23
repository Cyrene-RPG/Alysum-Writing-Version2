let current='',timer=null,accountClient=null,epoch=0;
function allowedPath(){return /^\/(?:moderation(?:-inbox|-preview)?|applications\/moderation|login|reset-password)/.test(location.pathname);}
export function wireUserPresence(session,client){
 if(!client)return;
 const id=session?.user?.id||'';if(id===current&&client===accountClient)return;
 current=id;accountClient=client;epoch++;clearInterval(timer);timer=null;
 if(!id)return;
 const token=epoch;
 async function touch(){
 if(document.hidden)return;
 try{
 const {data,error}=await client.rpc('mc_call',{p_action:'activity',p_payload:{kind:location.pathname==='/read'?'reading':'active'}});
 if(token!==epoch||error)return;
 if(data?.blocked&&!allowedPath())location.replace('/moderation-inbox');
 }catch{/* Activity tracking is best effort and never breaks existing pages before setup. */}
 }
 void touch();timer=setInterval(touch,120000);
}
