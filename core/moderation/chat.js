/** Uses the separate verified moderation client, never the normal-site session. */
export function createModeratorChatService(client){
 async function rpc(name,args){
  const {data,error}=await client.rpc(name,args);
  if(error){const e=new Error(['PGRST202','42P01','42883'].includes(error.code)?'Moderator chat setup is not installed yet. Run the moderator chat SQL migration.':error.message||'Chat could not connect.');e.code=error.code;throw e;}
  return data;
 }
 return {
  list:({before=null,after=null}={})=>rpc('mc_chat_list',{p_before:before,p_after:after}),
  async send(body,requestId){const text=String(body||'').trim();if(!text||text.length>4000)throw Error('Write a message of 1–4,000 characters.');return rpc('mc_chat_send',{p_request_id:requestId,p_body:text});},
 };
}
