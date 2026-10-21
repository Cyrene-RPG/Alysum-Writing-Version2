import {normalize,uid} from './model.js';
export function screenplayError(error) {
    if(error?.code==='P0002')return Object.assign(Error('This screenplay changed in another tab or device. Your version is safe on this device. Export a backup or reload the cloud version before continuing.'),{conflict:true});
    if(['42P01','42883','PGRST202','PGRST205'].includes(error?.code))return Error('Screenplay cloud storage has not been enabled yet. Your draft remains on this device; download a backup before changing devices.');
    return Error(error?.message||'Could not save online. Your device copy is retained.');
}
/** Backups are isolated by account, including in preview and local desktop mode. */
export function createScreenplaysApi(client,userId,options={}) {
    if(!userId)throw Error('Sign in to open your screenplays.');
    let storage=options.storage;
    if(!storage)try{storage=globalThis.localStorage;}catch{}
    storage ||= {length:0,key:()=>null,getItem:()=>null,setItem(){throw Error('Device storage is unavailable.');},removeItem(){}};
    const prefix='alysum:screenplay:v1:'+userId+':',recoveryPrefix=prefix+'recovery:',deviceId=uid();
    function read(id){try{return JSON.parse(storage.getItem(prefix+id)||'null');}catch{return null;}}
    function backup(id,document,baseVersion,requestId=uid()) {
        const entry={id,owner_id:userId,document:normalize(document),version:baseVersion,requestId,pending:true,updated_at:new Date().toISOString()};
        try{
            // Each open editor retains its own latest copy, even if another tab
            // replaces the shared cache entry. Keep the five newest recoveries.
            storage.setItem(recoveryPrefix+id+':'+deviceId,JSON.stringify(entry));
            storage.setItem(prefix+id,JSON.stringify(entry));
            const older=deviceCopies(id).slice(5);for(const copy of older)storage.removeItem(copy.key);
        }catch{throw Error('Device storage is full or unavailable. Download a backup now; this edit is not saved on this device.');}
        return entry;
    }
    async function query(builder){const {data,error}=await builder;if(error)throw screenplayError(error);return data;}
    function cached(){const rows=[];try{for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(prefix)&&!key.startsWith(recoveryPrefix)){const row=read(key.slice(prefix.length));if(row)rows.push(row);}}}catch{}return rows;}
    function deviceCopies(id){const rows=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(recoveryPrefix+id+':')){try{const entry=JSON.parse(storage.getItem(key));if(entry?.document)rows.push({key,entry});}catch{}}}return rows.sort((a,b)=>b.entry.updated_at.localeCompare(a.entry.updated_at));}
    return {
        local:!client,backup,cached,read,deviceCopies,
        async list(){const local=cached();if(!client)return local;const online=await query(client.from('screenplays').select('id,title,version,updated_at').eq('owner_id',userId).order('updated_at',{ascending:false}));const merged=new Map((online||[]).map(row=>[row.id,row]));for(const row of local)if(row.pending||!merged.has(row.id))merged.set(row.id,{...row,title:row.document.title});return [...merged.values()];},
        async get(id){const local=read(id);if(!client){if(!local)throw Error('This screenplay is not saved on this device.');return local;}let remote;try{remote=await query(client.from('screenplays').select('*').eq('id',id).eq('owner_id',userId).maybeSingle());}catch(error){if(local)return {...local,offlineError:error.message};throw error;}if(!remote){if(local?.version===0)return local;throw Error('This screenplay is not available to your account.');}if(local?.pending)return {...local,remoteVersion:remote.version};return remote;},
        async save(id,document,version,requestId,label='') {
            const doc=normalize(document);let saved;
            if(client){const {data,error}=await client.rpc('save_screenplay',{p_id:id,p_expected_version:version,p_document:doc,p_request_id:requestId,p_label:label});if(error)throw screenplayError(error);if(!data?.id||!Number.isInteger(data.version))throw Error('Could not confirm the save. Your device copy is retained.');saved=data;}
            else saved={id,owner_id:userId,title:doc.title,document:doc,version:version+1,updated_at:new Date().toISOString()};
            const current=read(id);
            if(current){if(current.requestId===requestId){storage.setItem(prefix+id,JSON.stringify({...saved,pending:false}));}else if(current.version===version){storage.setItem(prefix+id,JSON.stringify({...current,version:saved.version}));}}
            return saved;
        },
        async create(document={}){const id=uid(),doc=normalize(document),entry=backup(id,doc,0);try{return await this.save(id,doc,0,entry.requestId);}catch(error){return {...entry,offlineError:error.message};}},
        async revisions(id){if(!client)return [];const [recent,named]=await Promise.all([query(client.from('screenplay_revisions').select('id,version,label,created_at').eq('screenplay_id',id).order('version',{ascending:false}).limit(100)),query(client.from('screenplay_revisions').select('id,version,label,created_at').eq('screenplay_id',id).neq('label','').order('version',{ascending:false}).limit(1000))]);return [...new Map([...(recent||[]),...(named||[])].map(row=>[row.id,row])).values()].sort((a,b)=>b.version-a.version);},
        async revision(id,version){if(!client)throw Error('Revision history is available for cloud saves.');return await query(client.from('screenplay_revisions').select('document').eq('screenplay_id',id).eq('version',version).single());},
        async remote(id){if(!client)throw Error('This is a device-only draft.');return await query(client.from('screenplays').select('*').eq('id',id).eq('owner_id',userId).single());},
    };
}
