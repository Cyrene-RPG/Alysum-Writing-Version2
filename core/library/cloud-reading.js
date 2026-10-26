/** Account-bound reading-state sync. Pending changes survive failed startup and writes. */
export function cloudReadingSync(client,{userId,state,storage,kinds,onStatus=()=>{},readTimeoutMs=6000}){
 const pendingKey=`alysum:library:cloud-pending:${encodeURIComponent(userId)}`;
 let pending=new Map(),timer=null,running=null,initializing=null,active=true,ready=false,snapshot=null;
 try{for(const entry of JSON.parse(storage?.getItem(pendingKey)||'[]'))if(kinds.includes(entry.kind)&&typeof entry.bookId==='string')pending.set(entry.kind+'\n'+entry.bookId,entry);}catch{}
 const persist=()=>{try{storage?.setItem(pendingKey,JSON.stringify([...pending.values()]));}catch{}};
 async function rpc(args){
  if(!active||!state.active)throw Error('Reading account changed.');
  let request=client.rpc('library_hub_state',{p_user:userId,p_kind:null,p_book:null,p_value:null,p_write:false,...args});
  let deadline;const controller=new AbortController();
  if(!args.p_write&&typeof request.abortSignal==='function')request=request.abortSignal(controller.signal);
  try{
   const result=args.p_write?await request:await Promise.race([request,new Promise((_,reject)=>{deadline=setTimeout(()=>{reject(Error('Reading-state request timed out. Your device copy is still available.'));controller.abort();},readTimeoutMs);})]);
   if(result.error)throw result.error;return result.data;
  }finally{clearTimeout(deadline);}
 }
 function enqueue(kind,patch){if(!active||!state.active)return;for(const[bookId,value]of Object.entries(patch))pending.set(kind+'\n'+bookId,{kind,bookId,value:value??null});persist();if(!timer)timer=setTimeout(()=>{timer=null;void flush().catch(()=>{});},1200);}
 async function flush(){
  if(!active||!state.active)return false;
  if(!ready){await start();if(!ready)return false;}
  if(running){await running;return pending.size&&active&&state.active?flush():!pending.size;}
  if(timer){clearTimeout(timer);timer=null;}
  running=(async()=>{
   for(const[key,entry]of[...pending]){if(!active||!state.active)break;await rpc({p_kind:entry.kind,p_book:entry.bookId,p_value:entry.value,p_write:true});if(pending.get(key)===entry)pending.delete(key);persist();}
   onStatus(pending.size?'pending':'saved');return !pending.size;
  })().catch(error=>{onStatus('offline');throw error;}).finally(()=>{running=null;});
  const saved=await running;if(!saved&&active&&state.active)return flush();return saved;
 }
 async function start(){
  if(!active||!state.active)return null;if(ready)return snapshot;if(initializing)return initializing;
  initializing=(async()=>{
   try{
    const next=await rpc({});if(!active||!state.active)return null;
    const remote=new Map();for(const row of next.records||[])if(kinds.includes(row.kind))remote.set(row.kind+'\n'+row.bookId,row);
    for(const kind of kinds){const local=state.read(kind),merged={...local};
     for(const row of next.records||[])if(row.kind===kind){if(row.value===null)delete merged[row.bookId];else merged[row.bookId]=row.value;}
     for(const[bookId,value]of Object.entries(local))if(!remote.has(kind+'\n'+bookId)&&!pending.has(kind+'\n'+bookId))pending.set(kind+'\n'+bookId,{kind,bookId,value});
     for(const entry of pending.values())if(entry.kind===kind){if(entry.value===null)delete merged[entry.bookId];else merged[entry.bookId]=entry.value;}
     state.hydrate(kind,merged);
    }
    snapshot=next;ready=true;persist();onStatus(pending.size?'pending':'saved');return snapshot;
   }catch{onStatus('offline');return null;}
  })();
  try{const result=await initializing;if(ready)void flush().catch(()=>{});return result;}finally{initializing=null;}
 }
 return{start,enqueue,flush,get ready(){return ready;},get snapshot(){return snapshot;},stop(){active=false;if(timer)clearTimeout(timer);persist();}};
}
