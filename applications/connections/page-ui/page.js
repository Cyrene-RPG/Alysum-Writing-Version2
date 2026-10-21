import {CONNECTION_KINDS,CONNECTION_PAGE_SIZE} from "../../../core/account/connections.js";
import {authorProfileUrl} from "../../../core/library/author-links.js";

export function mountConnections({api,root=document,location=window.location}) {
    const el=id=>root.getElementById(id);
    let userId="",ready=false,kind=Object.hasOwn(CONNECTION_KINDS,location.hash.slice(1))?location.hash.slice(1):"following";
    let rows=[],cursor="",hasMore=false,loading=false,accountEpoch=0,viewEpoch=0,summary={following:0,subscriptions:0,followers:0};
    const status=el("connections-status"),list=el("connections-list");
    function controls(){
        el("connections-content").hidden=!userId;
        el("connections-sign-in").hidden=!ready||Boolean(userId);
        el("connections-more").hidden=!hasMore;
        el("connections-more").disabled=loading;
        el("connections-refresh").disabled=loading||!userId;
        for(const key of Object.keys(CONNECTION_KINDS)){
            el("tab-"+key).setAttribute("aria-pressed",String(kind===key));
            el("count-"+key).textContent=String(summary[key]||0);
        }
    }
    function draw(){
        list.replaceChildren();
        for(const row of rows){
            const article=root.createElement("article");article.className="connections-card";
            const avatar=root.createElement("div");avatar.className="connections-avatar"+(kind==="subscriptions"?" is-cover":"");
            const initial=root.createElement("span");initial.textContent=row.displayName.trim().charAt(0).toUpperCase()||"A";avatar.append(initial);
            if(/^https?:\/\//i.test(row.imageUrl)){
                const img=root.createElement("img");img.src=row.imageUrl;img.alt="";img.loading="lazy";
                img.onerror=()=>img.remove();avatar.append(img);
            }
            const info=root.createElement("div");info.className="connections-info";
            const heading=root.createElement("h2");heading.className="lib-display-title";
            const href=kind==="subscriptions" ? (row.available?"/book?id="+encodeURIComponent(row.bookId):null)
                :authorProfileUrl({userId:row.authorId});
            if(href){const link=root.createElement("a");link.href=href;link.textContent=row.displayName;heading.append(link);}
            else heading.textContent=row.displayName;
            const detail=root.createElement("p");
            const date=new Date(row.createdAt),since=Number.isNaN(date.getTime())?"":date.toLocaleDateString(undefined,{dateStyle:"medium"});
            detail.textContent=kind==="subscriptions" ? (row.available?"New chapter notifications":"This listing is no longer publicly available.")
                :row.username?"@"+row.username:"";
            if(since)detail.textContent+=(detail.textContent?" · ":"")+since;
            info.append(heading,detail);article.append(avatar,info);
            if(kind!=="followers"){
                const button=root.createElement("button");button.type="button";
                button.textContent=kind==="following"?"Unfollow":"Unsubscribe";
                button.setAttribute("aria-label",button.textContent+" "+row.displayName);
                button.addEventListener("click",()=>void remove(row,button));
                article.append(button);
            }
            list.append(article);
        }
        el("connections-empty").hidden=Boolean(rows.length||loading);
        el("connections-empty").textContent=kind==="following"?"You’re not following any authors yet."
            :kind==="subscriptions"?"You haven’t subscribed to any books yet.":"No one is following you yet.";
    }
    async function refreshSummary(epoch){
        const value=await api.summary();
        if(epoch===accountEpoch){summary=value;controls();}
    }
    async function load(reset=true){
        if(!userId || (loading&&!reset))return;
        const account=accountEpoch,view=++viewEpoch,requestedKind=kind;
        loading=true;status.textContent="Loading "+CONNECTION_KINDS[kind].toLowerCase()+"…";controls();
        if(reset){rows=[];cursor="";hasMore=false;list.replaceChildren();}
        el("connections-empty").hidden=true;
        try{
            const page=await api.list({kind:requestedKind,afterId:reset?"":cursor});
            if(account!==accountEpoch||view!==viewEpoch)return;
            const seen=new Set(rows.map(x=>x.id));
            rows.push(...page.filter(x=>!seen.has(x.id)));
            cursor=page.at(-1)?.id||cursor;hasMore=page.length===CONNECTION_PAGE_SIZE;
            status.textContent="";loading=false;draw();
        }catch(error){
            if(account!==accountEpoch||view!==viewEpoch)return;
            status.textContent=error.message||"Could not load this list. Try Refresh.";
            el("connections-empty").hidden=true;
        }finally{
            if(account===accountEpoch&&view===viewEpoch){loading=false;controls();}
        }
    }
    async function remove(row,button){
        if(!userId||button.disabled)return;
        const account=accountEpoch,view=viewEpoch,selected=kind;
        button.disabled=true;status.textContent="";
        try{
            await api.remove({kind:selected,id:row.id,userId});
            if(account!==accountEpoch)return;
            summary={...summary,[selected]:Math.max(0,summary[selected]-1)};
            if(view===viewEpoch){
                rows=rows.filter(x=>x.id!==row.id);draw();
                status.textContent=selected==="following"?"Author unfollowed.":"Book subscription removed.";
            }
            controls();void refreshSummary(account).catch(()=>{});
        }catch(error){
            if(account===accountEpoch&&view===viewEpoch)status.textContent=error.message||"Could not save this change.";
        }finally{button.disabled=false;}
    }
    function setViewer(id){
        accountEpoch++;viewEpoch++;userId=String(id||"");ready=true;
        rows=[];cursor="";hasMore=false;loading=false;summary={following:0,followers:0,subscriptions:0};
        list.replaceChildren();el("connections-empty").hidden=true;controls();
        status.textContent=userId?"Loading your connections…":"Sign in to see your private lists.";
        if(userId){
            const epoch=accountEpoch;
            setTimeout(()=>{if(epoch!==accountEpoch)return;void load();void refreshSummary(epoch).catch(error=>{if(epoch===accountEpoch)status.textContent=error.message;});},0);
        }
    }
    function setKind(next){
        if(!Object.hasOwn(CONNECTION_KINDS,next)||kind===next)return;
        kind=next;viewEpoch++;rows=[];hasMore=false;loading=false;cursor="";
        list.replaceChildren();el("connections-empty").hidden=true;controls();
        void load();
    }
    for(const key of Object.keys(CONNECTION_KINDS))el("tab-"+key).addEventListener("click",()=>{location.hash=key;setKind(key);});
    el("connections-more").addEventListener("click",()=>void load(false));
    el("connections-refresh").addEventListener("click",()=>{const epoch=accountEpoch;void load();void refreshSummary(epoch).catch(()=>{});});
    controls();status.textContent="Checking sign-in…";
    return {setViewer,setKind,refresh:()=>load()};
}
