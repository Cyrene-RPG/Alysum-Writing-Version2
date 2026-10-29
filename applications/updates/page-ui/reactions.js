import {UPDATE_REACTIONS,getUpdateReactions,setUpdateReaction} from '/core/publishing/update-reactions.js';

/** One auth subscription and batched reads for the visible feed. */
export function createUpdateReactionFeed(client) {
    const cards = new Set();
    let userId=null,epoch=0,stopped=false,authKnown=false;
    function paint(card) {
        if (!card.root.isConnected) return;
        for (const {item,button,count} of card.buttons) {
            const total=card.state?.counts[item.id],selected=card.state?.mine.includes(item.id)||false;
            button.disabled=card.busy||card.loading||!card.state||!userId;
            button.setAttribute('aria-pressed',String(selected));
            button.setAttribute('aria-label',`${item.label}${total===undefined?'':` · ${total} reaction${total===1?'':'s'}`}${selected?' · Selected':''}`);
            count.textContent=total===undefined?'—':total.toLocaleString();
        }
        card.group.setAttribute('aria-busy',String(card.busy||card.loading));
        card.signIn.hidden=Boolean(userId);
    }
    async function refresh(targets=[...cards]) {
        const turn=epoch;
        const live=targets.filter(c=>cards.has(c)&&c.root.isConnected&&!c.busy);
        const versions=new Map(live.map(c=>{c.loading=true;c.retry.hidden=true;c.version++;paint(c);return[c,c.version];}));
        for (let start=0;start<live.length;start+=20) {
            const batch=live.slice(start,start+20);
            try {
                const states=await getUpdateReactions(client,batch.map(c=>c.postId),userId);
                if (stopped||turn!==epoch) return;
                for (const card of batch) {
                    if (!cards.has(card)||card.version!==versions.get(card)) continue;
                    card.state=states.get(card.postId)||null;
                    card.status.textContent=card.state?'':'This update is no longer available.';
                    card.loading=false;paint(card);
                }
            } catch(error) {
                if (stopped||turn!==epoch) return;
                for (const card of batch) {
                    if (!cards.has(card)||card.version!==versions.get(card)) continue;
                    card.state=null;card.loading=false;card.status.textContent=error.message;
                    card.retry.hidden=false;paint(card);
                }
            }
        }
    }
    function changeAccount(id) {
        if(stopped)return;
        epoch++;userId=id||null;authKnown=true;
        for(const card of cards){card.version++;card.state=null;card.busy=false;card.loading=true;card.status.textContent='';paint(card);}
        void refresh();
    }
    const initialEpoch=epoch;
    const ready=client.auth.getSession().then(({data,error})=>{
        if(!stopped&&epoch===initialEpoch)changeAccount(error?null:data?.session?.user?.id);
    }).catch(()=>{if(!stopped&&epoch===initialEpoch)changeAccount(null);});
    const subscription=client.auth.onAuthStateChange((_event,session)=>{
        // Token refresh keeps an in-flight write for the same member intact.
        const id=session?.user?.id||null;
        if(authKnown&&id===userId){setTimeout(()=>{if(!stopped)void refresh();},0);return;}
        // Invalidate immediately, then leave the auth callback before reading.
        epoch++;userId=id;authKnown=true;
        for(const card of cards){card.version++;card.state=null;card.busy=false;card.loading=true;paint(card);}
        const turn=epoch;
        setTimeout(()=>{if(!stopped&&turn===epoch)void refresh();},0);
    });
    function add(entries) {
        const added=[];
        for(const {article,post} of entries) {
            const root=document.createElement('div');root.className='update-reactions';
            const group=document.createElement('div');group.className='update-reaction-options';group.setAttribute('role','group');group.setAttribute('aria-label',`Reactions to ${post.title}`);
            const status=document.createElement('p');status.className='update-reaction-status';status.setAttribute('role','status');
            const retry=document.createElement('button');retry.type='button';retry.className='update-reaction-retry';retry.textContent='Refresh reactions';retry.hidden=true;
            const signIn=document.createElement('a');signIn.className='update-reaction-signin';signIn.textContent='Sign in to react';signIn.href='/login?next='+encodeURIComponent(location.pathname+location.search);
            const card={root,postId:post.id,group,status,retry,signIn,state:null,busy:false,loading:true,version:0,buttons:[]};
            for(const item of UPDATE_REACTIONS) {
                const button=document.createElement('button');button.type='button';button.className='update-reaction';button.title=item.label;
                const emoji=document.createElement('span');emoji.textContent=item.emoji;emoji.setAttribute('aria-hidden','true');
                const count=document.createElement('span');count.className='update-reaction-count';count.setAttribute('aria-hidden','true');
                button.append(emoji,count);group.append(button);card.buttons.push({item,button,count});
                button.addEventListener('click',()=>void save(card,item.id));
            }
            retry.addEventListener('click',()=>void refresh([card]));
            root.append(group,signIn,status,retry);article.append(root);cards.add(card);added.push(card);paint(card);
        }
        void ready.then(()=>{if(!stopped)void refresh(added);});
    }
    async function save(card,reaction) {
        if(stopped||!cards.has(card)||card.busy||card.loading||!card.state||!userId)return;
        const turn=epoch,version=++card.version,actor=userId;
        const selected=!card.state.mine.includes(reaction);
        card.busy=true;card.retry.hidden=true;card.status.textContent='';paint(card);
        try {
            const state=await setUpdateReaction(client,card.postId,reaction,selected,actor);
            if(stopped||turn!==epoch||!cards.has(card)||card.version!==version)return;
            card.state=state;card.status.textContent=selected?'Reaction saved.':'Reaction removed.';
        } catch {
            if(stopped||turn!==epoch||!cards.has(card)||card.version!==version)return;
            // An uncertain save may have committed. Read before enabling another write.
            card.state=null;card.status.textContent='Could not confirm your reaction. Refresh reactions before trying again.';card.retry.hidden=false;
        } finally {
            if(turn===epoch&&cards.has(card)&&card.version===version){card.busy=false;paint(card);}
        }
    }
    const onFocus=()=>{void ready.then(()=>{if(!stopped)void refresh();});};
    window.addEventListener('focus',onFocus);
    return {add,clear(){cards.clear();},destroy(){stopped=true;epoch++;cards.clear();subscription?.data?.subscription?.unsubscribe();window.removeEventListener('focus',onFocus);}};
}
