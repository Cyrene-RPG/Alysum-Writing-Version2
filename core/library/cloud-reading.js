/** Account-bound, per-book reading-state sync. Local pending changes survive a failed save. */
export function cloudReadingSync(client,{userId,state,storage,kinds,onStatus=()=>{}}){
 const pendingKey=`alysum:library:cloud-pending:${encodeURIComponent(userId)}`;
 let pending=new Map(),timer=null,running=null,active=true,ready=false;
 try{for(const entry of JSON.parse(storage?.getItem(pendingKey)||'[]'))if(kinds.includes(entry.kind)&&typeof entry.bookId==='string')pending.set(entry.kind+'\n'+entry.bookId,entry);}catch{}
 const persist=()=>{try{storage?.setItem(pendingKey,JSON.stringify([...pending.values()]));}catch{}};
 async function rpc(args){if(!active||!state.active)throw Error('Reading account changed.');const {data,error}=await client.rpc('library_hub_state',{p_user:userId,p_kind:null,p_book:null,p_value:null,p_write:false,...args});if(error)throw error;return data;}
 function enqueue(kind,patch){if(!active||!state.active)return;for(const [bookId,value]of Object.entries(patch)){pending.set(kind+'\n'+bookId,{kind,bookId,value:value??null});}persist();if(!timer)timer=setTimeout(()=>{timer=null;void flush().catch(()=>{});},1200);}
 async function flush(){if(running){await running;if(pending.size&&active&&state.active&&ready)return flush();return !pending.size;}if(!ready||!active||!state.active)return false;
  if(timer){clearTimeout(timer);timer=null;}
  let succeeded=false;
  running=(async()=>{for(const [key,entry]of [...pending]){if(!active||!state.active)break;await rpc({p_kind:entry.kind,p_book:entry.bookId,p_value:entry.value,p_write:true});if(pending.get(key)===entry)pending.delete(key);persist();}succeeded=true;onStatus(pending.size?'pending':'saved');return !pending.size;})().catch(error=>{onStatus('offline');throw error;}).finally(()=>{running=null;if(succeeded&&pending.size&&active&&state.active&&!timer)timer=setTimeout(()=>{timer=null;void flush().catch(()=>{});},1200);});return running;
 }
 async function start(){
  try{const snapshot=await rpc({});if(!active||!state.active)return null;
   const remote=new Map();for(const row of snapshot.records||[])if(kinds.includes(row.kind))remote.set(row.kind+'\n'+row.bookId,row);
   for(const kind of kinds){const local=state.read(kind),merged={...local};
    for(const row of snapshot.records||[])if(row.kind===kind){if(row.value===null)delete merged[row.bookId];else merged[row.bookId]=row.value;}
    for(const [bookId,value]of Object.entries(local))if(!remote.has(kind+'\n'+bookId)&&!pending.has(kind+'\n'+bookId))pending.set(kind+'\n'+bookId,{kind,bookId,value});
    for(const entry of pending.values())if(entry.kind===kind){if(entry.value===null)delete merged[entry.bookId];else merged[entry.bookId]=entry.value;}
    state.hydrate(kind,merged);
   }
   ready=true;persist();onStatus(pending.size?'pending':'saved');void flush().catch(()=>{});return snapshot;
  }catch(error){onStatus('offline');return null;}
 }
 return {start,enqueue,flush,get ready(){return ready;},stop(){active=false;if(timer)clearTimeout(timer);persist();}};
}
