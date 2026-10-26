import {cloudReadingSync} from './cloud-reading.js';
/** Personal Library state is owned by an account, never by the whole browser.
 * Legacy unowned keys are deliberately left intact but never auto-assigned. */
export const READING_KINDS = ['read-position','shelves','finished-chapters','bookmarks'];
const PREFIX='alysum:library:';
function record(value) {return value && typeof value==='object' && !Array.isArray(value)?value:{};}
export function readingScope(session) {
    if(session?.mode==='local')return 'local';
    const id=session?.mode==='cloud'?String(session.user?.id || '').trim():'';
    return id?`user:${encodeURIComponent(id)}`:null;
}
export function createReadingState({scope=null,storage=null,onWrite=()=>{}}={}) {
    let active=true;const memory=new Map();
    function key(kind) {if(!READING_KINDS.includes(kind))throw Error('Unknown reading state.');return scope?`${PREFIX}${kind}:${scope}`:null;}
    function read(kind) {
        const name=key(kind);if(!active)return {};
        if(!name)return structuredClone(memory.get(kind)||{});
        try {const raw=storage?.getItem(name);if(raw!==null && raw!==undefined)return record(JSON.parse(raw));}catch{/* Retain this visit's state when storage is unavailable. */}
        return structuredClone(memory.get(kind)||{});
    }
    function write(kind,value) {
        const name=key(kind);if(!active)return false;
        const previous=read(kind);
        const map=record(value);memory.set(kind,structuredClone(map));
        if(name)try{storage?.setItem(name,JSON.stringify(map));}catch{/* Keep reading usable without browser storage. */}
        const patch={};for(const book of new Set([...Object.keys(previous),...Object.keys(map)]))if(JSON.stringify(previous[book])!==JSON.stringify(map[book]))patch[book]=map[book]??null;
        if(Object.keys(patch).length)onWrite(kind,patch);
        return true;
    }
    return {scope,persistent:Boolean(scope),read,write,key,
        hydrate(kind,value){const map=record(value);memory.set(kind,structuredClone(map));try{if(key(kind))storage?.setItem(key(kind),JSON.stringify(map));}catch{}},
        update(kind,bookId,value){const map=read(kind);if(value===undefined)delete map[bookId];else map[bookId]=value;return write(kind,map);},
        invalidate(){active=false;memory.clear();},
        get active(){return active;},
        ownsStorageKey(name){return Boolean(scope && READING_KINDS.some(kind=>name===key(kind)));}
    };
}
export function trackReadingAccount(auth,state,onAccountChange) {
    const result=auth.onAuthStateChange((_event,next)=>{
        if(state.scope==='local')return;
        const scope=readingScope(next?.user?{mode:'cloud',user:next.user}:{mode:'none'});
        if(scope===state.scope || !state.active)return;
        state.invalidate();onAccountChange?.();
    });
    return ()=>result?.data?.subscription?.unsubscribe();
}
export async function openReadingState(supabase,{local=false,storage,onAccountChange,onCloudStatus}={}) {
    let session={mode:local?'local':'none',user:null};
    if(!local)try{const {data}=await supabase.auth.getSession();if(data.session?.user)session={mode:'cloud',user:data.session.user};}catch{/* Fail closed; a prior account hint never owns anonymous reading state. */}
    if(storage===undefined)try{storage=globalThis.localStorage;}catch{storage=null;}
    let cloud=null;
    const state=createReadingState({scope:readingScope(session),storage,onWrite:(kind,patch)=>cloud?.enqueue(kind,patch)});
    const stopAuth=trackReadingAccount(supabase.auth,state,()=>{cloud?.stop();onAccountChange?.();});
    let snapshot=null;
    if(session.mode==='cloud'&&typeof supabase.rpc==='function'){
        cloud=cloudReadingSync(supabase,{userId:session.user.id,state,storage,kinds:READING_KINDS,onStatus:onCloudStatus});snapshot=await cloud.start();
    }
    return {state,session,snapshot,get cloudAvailable(){return Boolean(cloud?.ready);},flush:()=>cloud?.flush()||Promise.resolve(false),stop(){stopAuth();cloud?.stop();}};
}
