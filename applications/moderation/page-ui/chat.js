/** Private live room; no message/draft content is persisted in browser storage. */
export function mountModeratorChat({host,service,userId,onAccessLost=()=>{},pollMs=5000}){
 const el=(tag,text='')=>{const node=document.createElement(tag);node.textContent=text;return node;};
 const root=el('section');root.className='mc-chat md-panel';root.setAttribute('aria-label','Moderator chat');
 const heading=el('h2','Staff room'),intro=el('p','Private to verified moderators and admins. Messages stay in this room.');intro.className='md-muted';
 const older=el('button','Load earlier messages');older.type='button';older.hidden=true;
 const scroll=el('div');scroll.className='mc-chat-scroll';scroll.hidden=true;scroll.tabIndex=0;scroll.setAttribute('aria-label','Chat history');
 const log=el('ol');log.className='mc-chat-messages';log.setAttribute('role','log');log.setAttribute('aria-label','Staff messages');log.setAttribute('aria-live','polite');log.setAttribute('aria-relevant','additions');scroll.append(log);
 const empty=el('p','No messages yet. Start the conversation.');empty.className='md-muted';empty.hidden=true;
 const status=el('p','Connecting…');status.className='mc-chat-status md-muted';status.setAttribute('role','status');
 const form=el('form');form.className='mc-chat-compose';
 const label=el('label','Message the staff room'),input=el('textarea');input.rows=3;input.maxLength=4000;input.required=true;input.placeholder='Write a message…';label.append(input);
 const footer=el('div'),hint=el('small','Up to 4,000 characters · Ctrl/⌘ + Enter to send'),send=el('button','Send message');send.type='submit';send.disabled=true;send.className='md-primary';footer.append(hint,send);form.append(label,footer);
 root.append(heading,intro,older,scroll,empty,status,form);host.append(root);
 const messages=new Map(),nodes=new Map();let alive=true,epoch=0,timer,reading=false,sending=false,olderBusy=false,ready=false,requestId='',requestText='';
 const ids=()=>[...messages.keys()].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
 function paint(items,{history=false}={}){
  const height=scroll.scrollHeight,top=scroll.scrollTop,follow=height-top-scroll.clientHeight<80;
  for(const message of items||[]){if(!/^[1-9][0-9]*$/.test(String(message.id)))continue;messages.set(String(message.id),message);}
  const ordered=ids();for(let i=0;i<ordered.length;i++){
   const id=ordered[i];if(nodes.has(id))continue;const message=messages.get(id),item=el('li');item.className='mc-chat-message';
   item.classList.toggle('is-own',message.senderId===userId);
   const header=el('header'),name=el('strong',message.name||'Former staff member'),role=el('span',message.role==='admin'?'Admin':'Moderator'),time=el('time');
   time.dateTime=message.createdAt;time.textContent=new Date(message.createdAt).toLocaleString();header.append(name,role,time);
   const body=el('p',message.body);item.append(header,body);nodes.set(id,item);
   const next=ordered.slice(i+1).map(key=>nodes.get(key)).find(Boolean);log.insertBefore(item,next||null);
  }
  empty.hidden=messages.size>0;
  scroll.hidden=messages.size===0;
  if(history)scroll.scrollTop=top+scroll.scrollHeight-height;else if(follow)scroll.scrollTop=scroll.scrollHeight;
 }
 function errorMessage(error){
  if(error.code==='42501'){destroy();onAccessLost(error);return;}
  status.textContent=error.message||'Chat could not connect. Your draft is still here.';
 }
 function schedule(delay=pollMs){clearTimeout(timer);if(alive&&!document.hidden)timer=setTimeout(()=>void refresh(),delay);}
 async function refresh(){
  if(!alive||reading||document.hidden)return;reading=true;const generation=epoch;let nextDelay=pollMs;
  try{
   const ordered=ids(),data=await service.list(ordered.length?{after:ordered.at(-1)}:{});if(!alive||generation!==epoch)return;
   paint(data.items);if(!ordered.length)older.hidden=!data.hasOlder;
   ready=true;send.disabled=sending;status.textContent='Messages update automatically.';
   if(data.hasNewer)nextDelay=0;
  }catch(error){if(alive&&generation===epoch)errorMessage(error);}finally{reading=false;if(alive)schedule(nextDelay);}
 }
 older.addEventListener('click',async()=>{
  if(olderBusy||!alive)return;olderBusy=true;older.disabled=true;const generation=epoch;
  try{const data=await service.list({before:ids()[0]});if(!alive||generation!==epoch)return;paint(data.items,{history:true});older.hidden=!data.hasOlder;}
  catch(error){if(alive&&generation===epoch)errorMessage(error);}finally{olderBusy=false;older.disabled=false;}
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!alive||sending||!ready)return;
  const text=input.value.trim();if(!text||text.length>4000){status.textContent='Write a message of 1–4,000 characters.';return;}
  if(text!==requestText||!requestId){requestText=text;requestId=crypto.randomUUID();}
  const generation=epoch;sending=true;send.disabled=true;input.readOnly=true;status.textContent='Sending…';
  try{await service.send(text,requestId);if(!alive||generation!==epoch)return;input.value='';requestText='';requestId='';status.textContent='Message sent.';await refresh();}
  catch(error){if(alive&&generation===epoch)errorMessage(error);}
  finally{sending=false;if(alive){send.disabled=!ready;input.readOnly=false;}}
 });
 input.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.isComposing){event.preventDefault();form.requestSubmit();}});
 function onVisibility(){clearTimeout(timer);if(!document.hidden)void refresh();}
 document.addEventListener('visibilitychange',onVisibility);
 function destroy(){if(!alive)return;alive=false;epoch++;clearTimeout(timer);document.removeEventListener('visibilitychange',onVisibility);input.value='';messages.clear();nodes.clear();root.remove();}
 void refresh();return {refresh,destroy,root};
}
