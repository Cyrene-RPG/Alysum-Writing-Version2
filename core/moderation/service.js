const WRITES=new Set(['sanction','revoke_sanction','message','staff_reply','report_save','book_visibility','appeal_decision','set_staff','ip_add','ip_remove','user_reply','submit_appeal']);
export function createModerationService(client){
 return {async call(action,payload={},requestId){
 const args={...payload};if(WRITES.has(action))args.requestId=requestId||crypto.randomUUID();
 const {data,error}=await client.rpc('mc_call',{p_action:action,p_payload:args});
 if(error){const e=new Error(['PGRST202','42P01','42883'].includes(error.code)?'Moderation setup is not installed yet. Run the Moderation Center SQL migration.':error.message||'Could not complete the request.');e.code=error.code;throw e;}return data;
 }};
}
