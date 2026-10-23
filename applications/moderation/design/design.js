(function moderationDesign(){
'use strict';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ago=n=>new Date(Date.now()-n*864e5).toISOString().slice(0,10);
const state={view:new URLSearchParams(location.search).get('view')||'overview',role:'admin',verified:true,usersTab:'all',q:'',userStatus:'all',period:'7',activeMeasure:'activeDays',caseStatus:'open',caseReason:'all',bookStatus:'all',thread:'t1',auditQ:'',drafts:{},ipRules:[],counter:20};
const users=[
{id:'u1',name:'Mira Vale',handle:'miravale',type:'Author',joined:ago(0),last:'Today',activeDays:6,readingDays:2,writingDays:5,community:8,status:'Active',restrictions:[],staff:false},
{id:'u2',name:'Aster Quill',handle:'asterquill',type:'Both',joined:ago(18),last:'Today',activeDays:7,readingDays:6,writingDays:4,community:15,status:'Active',restrictions:[],staff:false},
{id:'u3',name:'Rowan Finch',handle:'rowanfinch',type:'Reader',joined:ago(2),last:'Yesterday',activeDays:3,readingDays:3,writingDays:0,community:2,status:'Suspended',restrictions:[],staff:false},
{id:'u4',name:'Lena North',handle:'lenanorth',type:'Both',joined:ago(83),last:'Today',activeDays:5,readingDays:4,writingDays:3,community:6,status:'Active',restrictions:['Commenting'],staff:false},
{id:'u5',name:'Theo Wren',handle:'theowren',type:'Author',joined:ago(0),last:'Today',activeDays:1,readingDays:0,writingDays:1,community:0,status:'Active',restrictions:[],staff:false},
{id:'u6',name:'Juniper Moss',handle:'junipermoss',type:'Reader',joined:ago(5),last:'2 days ago',activeDays:4,readingDays:4,writingDays:0,community:4,status:'Active',restrictions:[],staff:false},
{id:'s1',name:'Sample Admin',handle:'sampleadmin',type:'Both',joined:ago(200),last:'Today',activeDays:7,readingDays:3,writingDays:2,community:9,status:'Active',restrictions:[],staff:true},
{id:'s2',name:'Sample Moderator',handle:'samplemod',type:'Reader',joined:ago(160),last:'Today',activeDays:6,readingDays:5,writingDays:0,community:5,status:'Active',restrictions:[],staff:true}
];
const books=[
{id:'b1',title:'The Glass District',author:'u1',genre:'Cyberpunk',status:'Visible',chapters:12,reports:2},
{id:'b2',title:'The Lantern Keeper',author:'u2',genre:'Fantasy',status:'Visible',chapters:8,reports:1},
{id:'b3',title:'Salt & Ash',author:'u4',genre:'Horror',status:'Hidden',chapters:16,reports:1},
{id:'b4',title:'A Small Blue Hour',author:'u5',genre:'Literary fiction',status:'Visible',chapters:3,reports:0},
{id:'b5',title:'Sample Staff Book',author:'s1',genre:'Fantasy',status:'Visible',chapters:4,reports:1}
];
const cases=[
{id:'ALY-1042',kind:'Book',book:'b1',user:'u1',reason:'Missing content warnings',category:'tags',status:'New',assigned:'Unassigned',age:'18 min ago',reporter:'Sample Reader 01',evidence:'Chapter 4 contains a detailed injury scene. The current listing does not include an injury warning.',due:'',notes:[],history:[{what:'Reader report received',by:'System',when:'18 min ago'}]},
{id:'ALY-1041',kind:'Book',book:'b2',user:'u2',reason:'Suspected Use of AI',category:'ai',status:'Under Review',assigned:'Sample Moderator',age:'1 hour ago',reporter:'Sample Reader 02',evidence:'The reader identified passages in chapters 2 and 3 and requested a review. No conclusion has been reached.',due:ago(-2),notes:[{text:'Review the specific passages and request clarification before reaching a conclusion.',by:'Sample Moderator'}],history:[{what:'Assigned to Sample Moderator',by:'Sample Admin',when:'45 min ago'}]},
{id:'ALY-1040',kind:'Comment',book:'b1',user:'u3',reason:'Harassment / Targeted Abuse',category:'harassment',status:'Under Review',assigned:'Sample Moderator',age:'Yesterday',reporter:'Sample Reader 03',evidence:'A reported comment contains repeated personal insults directed at another reader.',due:'',notes:[],history:[{what:'Comment hidden pending review',by:'Sample Moderator',when:'Yesterday'}]},
{id:'ALY-1039',kind:'Book',book:'b3',user:'u4',reason:'Incorrect Age Rating',category:'rating',status:'Awaiting Changes',assigned:'Sample Admin',age:'Yesterday',reporter:'Sample Reader 04',evidence:'The selected rating appears inconsistent with the published content. The author has been contacted.',due:ago(-1),notes:[],history:[{what:'Requested rating correction',by:'Sample Admin',when:'Yesterday'}]},
{id:'ALY-1038',kind:'Book',book:'b5',user:'s1',reason:'Misleading description',category:'other',status:'New',assigned:'Unassigned',age:'2 days ago',reporter:'Sample Reader 05',evidence:'The reader says the description does not reflect the published chapters.',due:'',notes:[],history:[{what:'Reader report received',by:'System',when:'2 days ago'}]},
{id:'ALY-1037',kind:'Book',book:'b1',user:'u1',reason:'Missing content warnings',category:'tags',status:'Resolved',assigned:'Sample Moderator',age:'3 days ago',reporter:'Sample Reader 06',evidence:'A previous warning correction was requested and completed.',due:'',notes:[],history:[{what:'Warnings corrected; case resolved',by:'Sample Moderator',when:'3 days ago'}]}
];
const threads=[
{id:'t1',user:'u4',book:'b3',subject:'Age rating review — Salt & Ash',caseId:'ALY-1039',unread:true,messages:[{side:'staff',text:'Hi Lena,\nWe’re reviewing the age rating for Salt & Ash. Please review the published chapters and update the rating if needed. You can reply here with any questions.\nRequested review date: tomorrow.',time:'Yesterday · 3:42 PM'},{side:'user',text:'Thanks for letting me know. I have updated the rating and would appreciate another review.',time:'Today · 9:16 AM'}]},
{id:'t2',user:'u2',book:'b2',subject:'Request for clarification — The Lantern Keeper',caseId:'ALY-1041',unread:false,messages:[{side:'staff',text:'Hi Aster,\nWe received a concern about parts of The Lantern Keeper and are reviewing it. No decision has been made. Could you provide context about your writing process for chapters 2 and 3?',time:'Today · 8:30 AM'}]}
];
const appeals=[{id:'APL-028',user:'u3',status:'Pending',action:'7-day suspension',originalActor:'Sample Moderator',text:'I understand the comment was inappropriate. I would like the suspension reviewed and can provide context for the exchange.'}];
const audit=[{action:'Book hidden pending rating review',target:'Salt & Ash',actor:'Sample Admin',when:'Yesterday',type:'Book'},{action:'Comment restriction applied · 7 days',target:'Lena North',actor:'Sample Moderator',when:'Yesterday',type:'Account'},{action:'Suspension applied · 7 days',target:'Rowan Finch',actor:'Sample Moderator',when:'Yesterday',type:'Account'},{action:'Author contacted about rating',target:'Salt & Ash',actor:'Sample Admin',when:'Yesterday',type:'Message'}];
const templates={
review:{label:'Book under review',subject:'Book under review',text:'Hi {name},\nWe’re reviewing {book} following a reader concern. No decision has been made. We’ll contact you here if we need information or have an outcome to share.'},
tags:{label:'Update tags or content warnings',subject:'Content warning review',text:'Hi {name},\nPlease review the tags and content warnings for {book}, particularly [chapter / content]. Please let us know once you have made the changes or if you need clarification.'},
rating:{label:'Correct the age rating',subject:'Age rating review',text:'Hi {name},\nPlease review the age rating for {book}. The published content may require a different rating. Please reply once you have checked it or if you would like clarification.'},
clarify:{label:'Request for clarification',subject:'Request for clarification',text:'Hi {name},\nWe’re reviewing a concern about {book}. No conclusion has been reached. Could you provide context about [specific concern]?'},
warning:{label:'Policy warning',subject:'Official policy warning',text:'Hi {name},\nWe’re contacting you about [specific behavior] and [relevant site rule]. Please [requested action]. You can reply here if you have questions.'},
outcome:{label:'Investigation outcome',subject:'Review outcome',text:'Hi {name},\nOur review of {book} is complete. [Explain the finding, any action, its duration, and how to appeal.]'},
custom:{label:'Custom message',subject:'A message from Alysum Moderation',text:'Hi {name},\n'}
};
let toastTimer,returnFocus,afterAction=null;
const user=id=>users.find(u=>u.id===id),book=id=>books.find(b=>b.id===id),actor=()=>state.role==='admin'?'Sample Admin':'Sample Moderator';
const initials=name=>name.split(' ').map(x=>x[0]).slice(0,2).join('');
const badge=(text,tone)=>`<span class="md-badge ${tone||(['New','Awaiting Changes','Pending'].includes(text)?'amber':['Suspended','Hidden','Banned','Removed'].includes(text)?'red':['Resolved','Active','Visible','Verified'].includes(text)?'green':'neutral')}">${esc(text)}</span>`;
const button=(text,action,id='',cls='')=>`<button type="button" data-action="${action}" data-id="${esc(id)}" class="${cls}">${esc(text)}</button>`;
const avatar=u=>`<span class="md-avatar" aria-hidden="true">${esc(initials(u.name))}</span>`;
function log(action,target,type='Review'){audit.unshift({action,target,actor:actor(),when:'Just now',type});}
function toast(text){$('#md-toast').textContent=text;$('#md-toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#md-toast').hidden=true,5000);}
function title(name,description,actions=''){return `<div class="md-heading"><div><p class="md-eyebrow">Alysum / Moderation</p><h1 id="md-page-title" tabindex="-1">${esc(name)}</h1><p>${esc(description)}</p></div><div class="md-heading-actions">${actions}</div></div>`;}
function panelHeading(name,action=''){return `<div class="md-section-head"><h2>${esc(name)}</h2>${action}</div>`;}
function modal(name,body){returnFocus=document.activeElement;$('#md-dialog-title').textContent=name;$('#md-dialog-body').innerHTML=body;if(!$('#md-dialog').open){document.body.style.overflow='hidden';$('#md-dialog').showModal();}}
function closeModal(){if($('#md-dialog').open)$('#md-dialog').close();document.body.style.overflow='';returnFocus?.isConnected&&returnFocus.focus({preventScroll:true});}
function go(view){closeModal();state.view=view;if(view==='conversations')threads.find(t=>t.id===state.thread)&&(threads.find(t=>t.id===state.thread).unread=false);const url=new URL(location.href);url.searchParams.set('view',view);history.replaceState(null,'',url);render();$('#md-page-title')?.focus({preventScroll:true});window.scrollTo(0,0);}
const tabs=[['overview','Dashboard'],['reports','Reports'],['users','Users'],['books','Books'],['conversations','Conversations'],['appeals','Appeals'],['audit','Audit Log'],['security','Staff & Security']];
function render(){
const focused=document.activeElement,focusId=focused?.id,position=focused?.selectionStart;
if(!tabs.some(t=>t[0]===state.view)&&state.view!=='profile')state.view='overview';
if(state.role!=='admin'&&state.view==='security')state.view='overview';
if(!state.verified)state.view='profile';
$('#md-identity').textContent=actor()+' · '+(state.verified?'Verified':'Locked');
$('#md-nav').innerHTML=tabs.filter(t=>t[0]!=='security'||state.role==='admin').map(([id,label])=>{
const count=id==='reports'?cases.filter(c=>!['Resolved','Dismissed'].includes(c.status)).length:id==='appeals'?appeals.filter(a=>a.status==='Pending').length:id==='conversations'?threads.filter(t=>t.unread).length:0;
return `<button type="button" data-action="navigate" data-id="${id}" ${state.view===id?'aria-current="page"':''}>${label}${count?`<span class="md-badge neutral">${count}</span>`:''}</button>`;}).join('');
$('#md-screen').innerHTML=({overview:dashboard,reports:reportList,users:userList,books:bookList,conversations:conversationList,appeals:appealList,audit:auditList,security:security,profile:profileEntry}[state.view])();
if(focusId){const n=document.getElementById(focusId);if(n){n.focus({preventScroll:true});if(typeof position==='number'&&['search','text'].includes(n.type))n.setSelectionRange(position,position);}}
}
function dashboard(){
const open=cases.filter(c=>!['Resolved','Dismissed'].includes(c.status)),unassigned=open.filter(c=>c.assigned==='Unassigned'),newUsers=users.filter(u=>u.joined===ago(0));
return title('Dashboard','A clear view of the cases, conversations, and follow-ups that need attention.',button('View open reports','navigate','reports'))+
`<div class="md-metrics">${[[open.length,'Open cases','Across books and comments','reports'],[unassigned.length,'Unassigned','Ready for a staff member','reports'],[threads.filter(t=>t.unread).length,'Author replies','Waiting for a response','conversations'],[newUsers.length,'New users today','Review account activity','users']].map(([n,label,cap,view])=>`<button class="md-metric" data-action="${view==='users'?'new-users':'navigate'}" data-id="${view}"><span>${label}</span><strong>${n}</strong><small>${cap}</small></button>`).join('')}</div>
<div class="md-grid"><section class="md-panel">${panelHeading('Needs attention',button('All reports','navigate','reports'))}${open.slice(0,4).map(c=>`<div class="md-item"><div class="md-row"><div><p class="md-eyebrow">${esc(c.id)} · ${esc(c.kind)}</p><strong>${esc(book(c.book).title)}</strong><p class="md-muted md-small">${esc(c.reason)}</p></div>${badge(c.status)}</div><div class="md-row" style="margin-top:14px"><small class="md-muted">${esc(c.assigned)} · ${esc(c.age)}</small>${button('Open case','case',c.id)}</div></div>`).join('')}</section>
<div><section class="md-panel">${panelHeading('Follow-ups',button('Conversations','navigate','conversations'))}<ul class="md-list"><li><strong>Salt &amp; Ash</strong><p class="md-muted md-small">Author replied after updating the rating.</p>${button('Read reply','thread','t1','md-text-button')}</li><li><strong>The Lantern Keeper</strong><p class="md-muted md-small">Clarification requested. Follow up in 2 days.</p>${button('Open case','case','ALY-1041','md-text-button')}</li><li><strong>Appeal awaiting review</strong><p class="md-muted md-small">Rowan Finch · temporary suspension</p>${button('Review appeal','appeal','APL-028','md-text-button')}</li></ul></section>
<section class="md-panel">${panelHeading('Recent staff activity',button('Audit log','navigate','audit'))}${audit.slice(0,3).map(a=>`<div class="md-item"><strong class="md-small">${esc(a.action)}</strong><p class="md-muted md-small">${esc(a.target)} · ${esc(a.actor)}</p></div>`).join('')}</section></div></div>`;
}
function reportList(){
const rows=cases.filter(c=>(state.caseStatus==='all'||state.caseStatus==='open'&&!['Resolved','Dismissed'].includes(c.status)||c.status===state.caseStatus)&&(state.caseReason==='all'||c.category===state.caseReason));
return title('Reports','Book and comment reports in one case queue. Investigations do not automatically notify or penalize an author.')+
`<div class="md-toolbar"><label>Status<select id="md-case-status">${['open','all','New','Under Review','Awaiting Changes','Resolved','Dismissed'].map(x=>`<option value="${x}" ${state.caseStatus===x?'selected':''}>${x==='open'?'Open cases':x==='all'?'All statuses':x}</option>`).join('')}</select></label><label>Reason<select id="md-case-reason">${[['all','All reasons'],['tags','Tags / warnings'],['ai','Suspected AI use'],['harassment','Harassment'],['rating','Age rating'],['other','Other']].map(([v,l])=>`<option value="${v}" ${state.caseReason===v?'selected':''}>${l}</option>`).join('')}</select></label></div>
<section class="md-panel"><div class="md-table-wrap"><table class="md-table"><thead><tr><th>Case / book</th><th>Reason</th><th>Status</th><th>Assigned to</th><th>Received</th></tr></thead><tbody>${rows.map(c=>`<tr><td>${button(book(c.book).title,'case',c.id,'md-text-button')}<small>${esc(c.id)} · ${c.kind}</small></td><td>${esc(c.reason)}</td><td>${badge(c.status)}</td><td>${esc(c.assigned)}</td><td>${esc(c.age)}</td></tr>`).join('')}</tbody></table></div>${rows.length?'':empty('No reports match these filters.')}</section>`;
}
function empty(text){return `<p class="md-empty">${esc(text)}</p>`;}
function userList(){
let rows=users.filter(u=>(u.name+' '+u.handle).toLowerCase().includes(state.q.toLowerCase())&&(state.userStatus==='all'||u.status===state.userStatus));
if(state.usersTab==='new'){const end=state.end||ago(0),start=state.period==='custom'?(state.start||ago(30)):ago(Number(state.period)-1);rows=rows.filter(u=>u.joined>=start&&u.joined<=end).sort((a,b)=>b.joined.localeCompare(a.joined));}
if(state.usersTab==='active')rows.sort((a,b)=>b[state.activeMeasure]-a[state.activeMeasure]||a.name.localeCompare(b.name));
return title('Users','Find accounts, review new members, and understand activity without opening private manuscripts or exact reading histories.')+
`<div class="md-tabs" role="group" aria-label="User views">${[['all','All users'],['new','New users'],['active','Most active']].map(([v,l])=>`<button data-action="users-tab" data-id="${v}" aria-pressed="${state.usersTab===v}">${l}</button>`).join('')}</div>
<div class="md-toolbar"><label class="md-search" for="md-user-search">Search users<input id="md-user-search" type="search" placeholder="Name or username…" value="${esc(state.q)}"></label><label>Account status<select id="md-user-status">${['all','Active','Suspended','Banned'].map(v=>`<option value="${v}" ${state.userStatus===v?'selected':''}>${v==='all'?'All statuses':v}</option>`).join('')}</select></label>
${state.usersTab==='new'?`<label>Joined<select id="md-period">${[['1','Today'],['7','Last 7 days'],['30','Last 30 days'],['custom','Custom dates']].map(([v,l])=>`<option value="${v}" ${state.period===v?'selected':''}>${l}</option>`).join('')}</select></label>`:''}
${state.usersTab==='active'?`<label>Activity period<select id="md-active-period"><option value="7" ${state.period==='7'?'selected':''}>Last 7 days</option><option value="30" ${state.period==='30'?'selected':''}>Last 30 days</option></select></label><label>Rank by<select id="md-measure">${[['activeDays','Active days'],['readingDays','Reading days'],['writingDays','Writing days'],['community','Community actions']].map(([v,l])=>`<option value="${v}" ${state.activeMeasure===v?'selected':''}>${l}</option>`).join('')}</select></label>`:''}
${state.usersTab==='new'&&state.period==='custom'?`<label>From<input type="date" id="md-start" value="${esc(state.start||ago(30))}"></label><label>Through<input type="date" id="md-end" value="${esc(state.end||ago(0))}"></label>`:''}</div>
${state.usersTab==='active'?'<p class="md-muted md-small">Ranked by distinct active days by default. Refreshing pages does not add activity. These are sample aggregate counts.</p>':''}
<section class="md-panel">${panelHeading(rows.length+' accounts')}<div class="md-table-wrap"><table class="md-table"><thead><tr><th>User</th><th>Account</th><th>${state.usersTab==='active'?'Active / reading / writing days':'Joined'}</th><th>${state.usersTab==='active'?'Community actions':'Last active'}</th><th>Status</th></tr></thead><tbody>${rows.map(u=>`<tr><td><div class="md-row-start">${avatar(u)}<div>${button(u.name,'user',u.id,'md-text-button')}<small>@${esc(u.handle)}${u.staff?' · Staff':''}</small></div></div></td><td>${u.type}</td><td>${state.usersTab==='active'?`${activity(u,'activeDays')} / ${activity(u,'readingDays')} / ${activity(u,'writingDays')}`:u.joined}</td><td>${state.usersTab==='active'?activity(u,'community'):u.last}</td><td>${badge(u.status)}${u.restrictions.length?'<small>Feature restrictions</small>':''}</td></tr>`).join('')}</tbody></table></div>${rows.length?'':empty('No accounts match these filters.')}</section>`;
}
function activity(u,key){return state.period==='30'?Math.min(key==='community'?u[key]*3:30,u[key]*3):u[key];}
function bookList(){
const rows=books.filter(b=>state.bookStatus==='all'||b.status===state.bookStatus);
return title('Books','Review listings, request corrections, and manage public visibility. An account restriction does not automatically remove its books.')+
`<div class="md-toolbar"><label>Visibility<select id="md-book-status">${['all','Visible','Hidden','Removed'].map(x=>`<option ${state.bookStatus===x?'selected':''}>${x}</option>`).join('')}</select></label></div>
<section class="md-panel"><div class="md-table-wrap"><table class="md-table"><thead><tr><th>Book</th><th>Author</th><th>Published chapters</th><th>Reports</th><th>Visibility</th></tr></thead><tbody>${rows.map(b=>`<tr><td><div class="md-row-start"><span class="md-book-spine" aria-hidden="true">${esc(b.title[0])}</span><div>${button(b.title,'book',b.id,'md-text-button')}<small>${b.genre}</small></div></div></td><td>${button(user(b.author).name,'user',b.author,'md-text-button')}</td><td>${b.chapters}</td><td>${b.reports}</td><td>${badge(b.status)}</td></tr>`).join('')}</tbody></table></div>${rows.length?'':empty('No books match this filter.')}</section>`;
}
function conversationList(){
const t=threads.find(t=>t.id===state.thread)||threads[0];state.thread=t.id;
return title('Conversations','Official, private on-site conversations with users. Staff notes and reporter identities are never included automatically.',button('New staff message','new-message'))+
`<div class="md-conversations"><aside class="md-panel md-thread-list" aria-label="Conversations">${threads.map(t=>`<button data-action="thread" data-id="${t.id}" aria-pressed="${state.thread===t.id}"><strong>${esc(user(t.user).name)} ${t.unread?'•':''}</strong><small>${esc(t.subject)}</small><small>${esc(t.messages.at(-1).side==='user'?'Author replied':'Staff sent a message')}</small></button>`).join('')}</aside>
<section class="md-panel">${panelHeading(t.subject,button('Preview user inbox','recipient',t.id))}<p class="md-muted md-small">To ${esc(user(t.user).name)} · ${esc(book(t.book)?.title||'Account message')} ${t.caseId?' · '+esc(t.caseId):''}</p>
<div class="md-messages">${messageRows(t)}</div><form id="md-reply" data-thread="${t.id}" class="md-compose"><label for="md-reply-text">Reply as Alysum Moderation</label><textarea id="md-reply-text" maxlength="4000" required placeholder="Write a clear explanation or next step…">${esc(state.drafts[t.id]||'')}</textarea><div class="md-actions"><small class="md-muted">The user can reply even if posting is restricted.</small><button class="md-primary" type="submit">Send staff reply</button></div></form></section></div>`;
}
function messageRows(t){return t.messages.map(m=>`<article class="md-message ${m.side}"><strong>${esc(m.side==='staff'?'Alysum Moderation':user(t.user).name)}</strong><p>${esc(m.text)}</p><small>${esc(m.time)}</small></article>`).join('');}
function appealList(){return title('Appeals','Review requests separately from the original decision. Users retain access to moderation conversations and appeals during suspension.')+
`<section class="md-panel">${appeals.map(a=>`<div class="md-item"><div class="md-row"><div><p class="md-eyebrow">${a.id}</p><strong>${esc(user(a.user).name)}</strong><p class="md-muted md-small">${esc(a.action)} · Original action by ${esc(a.originalActor)}</p></div>${badge(a.status)}</div><div class="md-row" style="margin-top:16px"><p class="md-muted md-small">${esc(a.text.slice(0,100))}…</p>${button('Review appeal','appeal',a.id)}</div></div>`).join('')}</section>`;}
function auditList(){
const rows=audit.filter(a=>(a.action+' '+a.target+' '+a.actor).toLowerCase().includes(state.auditQ.toLowerCase()));
return title('Audit Log','A record of staff actions, messages, and reversals. Staff cannot edit or erase these entries.')+
`<div class="md-toolbar"><label class="md-search">Search history<input type="search" id="md-audit-search" placeholder="User, book, action, or staff member…" value="${esc(state.auditQ)}"></label></div><section class="md-panel"><div class="md-table-wrap"><table class="md-table"><thead><tr><th>Action</th><th>Subject</th><th>Staff member</th><th>When</th></tr></thead><tbody>${rows.map(a=>`<tr><td>${esc(a.action)}<small>${esc(a.type)}</small></td><td>${esc(a.target)}</td><td>${esc(a.actor)}</td><td>${esc(a.when)}</td></tr>`).join('')}</tbody></table></div>${rows.length?'':empty('No actions match this search.')}</section>`;
}
function security(){return title('Staff & Security','Admin-only controls. Network restrictions are separate from account sanctions and always have an expiry.')+
`<div class="md-grid"><section class="md-panel">${panelHeading('Staff access')}<div class="md-item"><div class="md-row"><div class="md-row-start">${avatar(user('s1'))}<div><strong>Sample Admin</strong><p class="md-muted md-small">Admin · full moderation access</p></div></div>${badge('2FA required','green')}</div></div><div class="md-item"><div class="md-row"><div class="md-row-start">${avatar(user('s2'))}<div><strong>Sample Moderator</strong><p class="md-muted md-small">Cases, temporary restrictions, conversations</p></div></div>${badge('2FA required','green')}</div></div><div class="md-callout">Staff cannot grant themselves permissions, sanction protected staff accounts, or delete audit records.</div>${button('View permission matrix','permissions')}</section>
<section class="md-panel">${panelHeading('Session protection')}${badge('Verified','green')}<p class="md-muted">Fresh identity verification at entry. Additional verification for serious actions. Idle sessions expire and return to the staff gate.</p><div class="md-session"><span>Preview session · ${esc(actor())}</span><span>15-minute inactivity limit in the proposed build</span></div><div class="md-actions" style="margin-top:18px">${button('Try the verification flow','verify')}</div></section></div>
<section class="md-panel">${panelHeading('Network restrictions',button('Add temporary rule','ip-rule','','md-primary'))}<p class="md-muted md-small">IP addresses can be shared by households, schools, mobile networks, or VPN users. An IP match alone does not establish account ownership.</p>
${state.ipRules.length?`<div class="md-table-wrap"><table class="md-table"><thead><tr><th>Address</th><th>Action</th><th>Expiry</th><th>Reason</th><th></th></tr></thead><tbody>${state.ipRules.map(r=>`<tr><td>${esc(r.ip)}</td><td>${esc(r.action)}</td><td>${esc(r.duration)}</td><td>${esc(r.reason)}</td><td>${button('Remove rule','remove-ip',r.id)}</td></tr>`).join('')}</tbody></table></div>`:empty('No network restrictions. Try a sample rule without blocking real traffic.')}</section>`;}
function profileEntry(){return title('Profile → Moderation','The proposed entry point inside your own profile. This section is visible only to authorized staff.')+
`<div class="md-profile"><section class="md-panel"><div class="md-profile-banner">${avatar(user(state.role==='admin'?'s1':'s2'))}<div><h2>${esc(actor())}</h2><p class="md-muted md-small">Your profile · Staff account</p></div></div><div class="md-row"><h2>Moderation</h2>${badge(state.role==='admin'?'Admin':'Moderator','neutral')}</div><p class="md-muted">Open your private staff workspace to review reports, manage cases, and contact users. You’ll verify your identity again before entering.</p><div class="md-callout">Use your existing staff account. A second account is not required. In the live build, staff membership and fresh verification will both be checked on the server.</div>${button('Open Moderation Center','verify','','md-primary')}<div class="md-session"><span>${state.verified?'Preview session is verified.':'Workspace locked.'}</span><span>Ordinary users do not see this section.</span></div></section></div>`;}
function openUser(id){
const u=user(id);modal(u.name,`<div class="md-row"><div class="md-row-start">${avatar(u)}<div><strong>@${esc(u.handle)}</strong><p class="md-muted">${u.type}${u.staff?' · Protected staff account':''}</p></div></div>${badge(u.status)}</div><div class="md-details"><div><small>Joined</small><strong>${u.joined}</strong></div><div><small>Last active</small><strong>${u.last}</strong></div><div><small>Active days · last 7 days</small><strong>${u.activeDays}</strong></div><div><small>Published books</small><strong>${books.filter(b=>b.author===u.id).length}</strong></div></div>
${u.restrictions.length?`<div class="md-callout amber">Restricted features: ${esc(u.restrictions.join(', '))}${u.expires?' · '+esc(u.expires):''}</div>`:''}
${u.staff?'<div class="md-callout">This is a protected staff account. Account sanctions are unavailable here.</div>':'<p class="md-muted">Account actions are separate from book visibility. Private manuscripts and exact reading histories are not shown.</p>'}
<h3>Published books</h3>${books.filter(b=>b.author===u.id).map(b=>`<div class="md-row md-item">${button(b.title,'book',b.id,'md-text-button')}${badge(b.status)}</div>`).join('')||'<p class="md-muted">No published books.</p>'}
<div class="md-actions">${button('Message user','message-user',id)}${!u.staff?button('Issue warning','account-action','warning:'+id)+button('Restrict features','account-action','restrict:'+id)+(u.status==='Active'?button('Suspend account','account-action','suspend:'+id):button('Restore account','account-action','restore:'+id))+(state.role==='admin'&&u.status!=='Banned'?button('Ban account','account-action','ban:'+id,'md-danger'):''):''}</div>`);
}
function openCase(id){
const c=cases.find(c=>c.id===id),conflict=user(c.user).name===actor();
modal(c.id+' · '+c.kind+' report',`<div class="md-row"><div><strong>${esc(book(c.book).title)}</strong><p class="md-muted md-small">${esc(c.reason)}</p></div>${badge(c.status)}</div>
${conflict?'<div class="md-callout amber">This case involves your account or book. Hand it to another staff member; review controls are disabled.</div>':''}
<div class="md-details"><div><small>Reported account</small><strong>${esc(user(c.user).name)}</strong></div><div><small>Reporter · staff only</small><strong>${esc(c.reporter)}</strong></div></div><h3>Concern and evidence</h3><p>${esc(c.evidence)}</p>${c.category==='ai'?'<div class="md-callout">A report or detector result is not proof of AI use. Review the passages and any author response before deciding.</div>':''}
<form id="md-case-form" data-case="${c.id}"><label for="md-assignee">Assigned staff member</label><select id="md-assignee">${['Unassigned','Sample Admin','Sample Moderator'].map(n=>`<option ${c.assigned===n?'selected':''}>${n}</option>`).join('')}</select><label for="md-case-state">Case status</label><select id="md-case-state" ${conflict?'disabled':''}>${['New','Under Review','Awaiting Changes','Resolved','Dismissed'].map(s=>`<option ${c.status===s?'selected':''}>${s}</option>`).join('')}</select><label for="md-case-due">Follow-up date (optional)</label><input type="date" id="md-case-due" value="${esc(c.due)}" ${conflict?'disabled':''}><div class="md-private"><strong>Private staff notes</strong><p class="md-muted md-small">These notes never appear in the author’s conversation.</p>${c.notes.map(n=>`<p>${esc(n.text)}<br><small class="md-muted">${esc(n.by)}</small></p>`).join('')}<label for="md-case-note">New note / resolution reason</label><textarea id="md-case-note" maxlength="4000" ${conflict?'disabled':''}></textarea></div><p class="md-error" id="md-form-error" role="alert"></p><div class="md-actions"><button type="submit" class="md-primary">${conflict?'Hand off case':'Save case'}</button>${!conflict?button('Contact author','case-message',c.id)+button('View book','book',c.book):''}</div></form><h3>Case history</h3>${timeline(c.history)}`);
}
function timeline(events){return `<div class="md-timeline">${events.map(e=>`<div><strong>${esc(e.what)}</strong><p>${esc(e.by)}</p><small>${esc(e.when)}</small></div>`).join('')}</div>`;}
function openBook(id){
const b=book(id),u=user(b.author),protectedBook=u.name===actor();
modal(b.title,`<div class="md-row"><div class="md-row-start"><span class="md-book-spine">${esc(b.title[0])}</span><div><strong>${esc(u.name)}</strong><p class="md-muted">${b.genre} · ${b.chapters} published chapters</p></div></div>${badge(b.status)}</div><p class="md-muted">Public listing and published-content review only. An author’s private drafts remain private.</p>${protectedBook?'<div class="md-callout amber">This is your book. Another staff member must handle moderation actions.</div>':''}<h3>Related cases</h3>${cases.filter(c=>c.book===id).map(c=>`<div class="md-item md-row">${button(c.id+' · '+c.reason,'case',c.id,'md-text-button')}${badge(c.status)}</div>`).join('')||'<p class="md-muted">No reports for this book.</p>'}<div class="md-actions">${!protectedBook?button('Request corrections','book-message',b.id)+(b.status==='Visible'?button('Hide pending review','book-action','hide:'+id):button('Restore visibility','book-action','restore:'+id))+(state.role==='admin'&&b.status!=='Removed'?button('Remove public listing','book-action','remove:'+id,'md-danger'):''):''}</div><p class="md-muted md-small">Removing a public listing does not delete the author’s manuscript. Visibility changes are recorded and reversible.</p>`);
}
function messageForm(userId='u1',bookId='',template='custom',caseId=''){
const u=user(userId),booksForUser=books.filter(b=>b.author===userId),b=book(bookId)||booksForUser[0];
modal('New official message',`<form id="md-message-form" data-case="${esc(caseId)}"><label for="md-message-user">To</label><select id="md-message-user">${users.map(x=>`<option value="${x.id}" ${x.id===userId?'selected':''}>${esc(x.name)}</option>`).join('')}</select><label for="md-message-book">Related book</label><select id="md-message-book"><option value="">Account message</option>${booksForUser.map(x=>`<option value="${x.id}" ${x.id===b?.id?'selected':''}>${esc(x.title)}</option>`).join('')}</select><label for="md-template">Message template</label><select id="md-template">${Object.entries(templates).map(([v,t])=>`<option value="${v}" ${v===template?'selected':''}>${t.label}</option>`).join('')}</select><label for="md-subject">Subject</label><input id="md-subject" maxlength="160" required><label for="md-message-text">Message to the user</label><textarea id="md-message-text" maxlength="4000" required rows="8"></textarea><label for="md-message-deadline">Requested response date (optional)</label><input id="md-message-deadline" type="date"><div class="md-callout">Sent as <strong>Alysum Moderation</strong> to the user’s on-site inbox. Reporter details and private case notes are not attached.</div><p id="md-form-error" class="md-error" role="alert"></p><div class="md-actions"><button type="submit" class="md-primary">Send official message</button>${button('Cancel','close-dialog')}</div></form>`);
fillTemplate();
}
function fillTemplate(){
const t=templates[$('#md-template').value],u=user($('#md-message-user').value),b=book($('#md-message-book').value);
$('#md-subject').value=t.subject+(b?' — '+b.title:'');$('#md-message-text').value=t.text.replaceAll('{name}',u.name.split(' ')[0]).replaceAll('{book}',b?.title||'your account');
}
function accountAction(raw){
const [action,id]=raw.split(':'),u=user(id);if(!u||u.staff||action==='ban'&&state.role!=='admin')return toast('This action is unavailable for this account.');
const names={warning:'Issue a policy warning',restrict:'Restrict account features',suspend:'Suspend account',ban:'Ban account',restore:'Restore account'};
modal(names[action],`<form id="md-account-form" data-user="${id}" data-kind="${action}"><p><strong>${esc(u.name)}</strong> · @${esc(u.handle)}</p><div class="md-callout ${action==='ban'?'red':'amber'}">${esc(action==='ban'?'Blocks normal account access indefinitely. The user can still read moderation messages, reply, and appeal.':action==='suspend'?'Blocks normal account access until the suspension expires. Moderation replies and appeals remain available.':action==='restrict'?'Only selected features will be restricted. Reading and moderation conversations remain available.':action==='restore'?'Ends this account’s suspension and feature restrictions. Public book visibility is unchanged.':'Sends an official on-site warning. No account features are restricted automatically.')}</div>${action==='restrict'?'<label><input type="checkbox" name="feature" value="Commenting">Commenting</label><label><input type="checkbox" name="feature" value="Publishing">Publishing</label><label><input type="checkbox" name="feature" value="Announcements">Announcements</label>':''}${['restrict','suspend'].includes(action)?'<label for="md-duration">Duration</label><select id="md-duration"><option>24 hours</option><option selected>7 days</option><option>30 days</option></select>':''}<label for="md-rule">Reason / site rule</label><input id="md-rule" maxlength="160" required placeholder="Identify the relevant rule or reason"><label for="md-action-note">Explanation the user will receive</label><textarea id="md-action-note" required maxlength="4000" placeholder="Explain the concern, its effect, and how to appeal."></textarea><p class="md-muted md-small">The user’s books keep their existing visibility. Manage book visibility separately.</p>${action==='ban'?'<label><input type="checkbox" id="md-confirm-ban">I have reviewed the evidence and intend to ban this account.</label>':''}<p id="md-form-error" class="md-error" role="alert"></p><div class="md-actions"><button type="submit" class="${action==='ban'?'md-danger':'md-primary'}">${esc(names[action])}</button>${button('Cancel','close-dialog')}</div></form>`);
}
function bookAction(raw){
const [action,id]=raw.split(':'),b=book(id);if(user(b.author).name===actor()||action==='remove'&&state.role!=='admin')return;
modal(action==='restore'?'Restore book visibility':action==='remove'?'Remove public listing':'Hide book pending review',`<form id="md-book-action" data-book="${id}" data-kind="${action}"><p><strong>${esc(b.title)}</strong></p><div class="md-callout">This changes public visibility only. The manuscript is preserved, and the action can be reversed.</div><label for="md-book-reason">Reason / outcome</label><textarea id="md-book-reason" required maxlength="4000"></textarea><p id="md-form-error" class="md-error" role="alert"></p><div class="md-actions"><button class="${action==='remove'?'md-danger':'md-primary'}" type="submit">Confirm visibility change</button>${button('Cancel','close-dialog')}</div></form>`);
}
function recipient(id){
const t=threads.find(t=>t.id===id);
modal('User inbox preview',`<p class="md-eyebrow">What ${esc(user(t.user).name)} sees</p><h3>${esc(t.subject)}</h3><p class="md-muted md-small">Official conversation with Alysum Moderation${book(t.book)?' · '+esc(book(t.book).title):''}</p><div class="md-messages">${messageRows(t)}</div><form id="md-user-reply" data-thread="${id}"><label for="md-user-reply-text">Reply to moderation</label><textarea id="md-user-reply-text" maxlength="4000" required placeholder="This reply returns to the staff conversation."></textarea><p class="md-muted md-small">Available during account restrictions. Private staff notes and reporter identities are not visible here.</p><p id="md-form-error" class="md-error" role="alert"></p><div class="md-actions"><button type="submit" class="md-primary">Send user reply</button>${(user(t.user).status!=='Active'||user(t.user).restrictions.length)?button('Appeal restriction','new-appeal',t.user):''}</div></form>`);
}
function openAppeal(id){
const a=appeals.find(a=>a.id===id),conflict=a.originalActor===actor();
modal('Appeal '+id,`<p><strong>${esc(user(a.user).name)}</strong> · ${esc(a.action)}</p>${badge(a.status)}<p class="md-muted md-small">Original action by ${esc(a.originalActor)}</p><h3>User’s appeal</h3><p>${esc(a.text)}</p>${conflict?'<div class="md-callout amber">You made the original decision. Hand this appeal to another staff member.</div>'+button('Hand off appeal','handoff-appeal',id):`<form id="md-appeal-form" data-appeal="${id}"><label for="md-appeal-decision">Decision</label><select id="md-appeal-decision"><option value="clarify">Request clarification</option><option value="uphold">Uphold decision</option><option value="reverse">Reverse restriction</option></select><label for="md-appeal-note">Explanation to the user</label><textarea id="md-appeal-note" required maxlength="4000"></textarea><p id="md-form-error" class="md-error" role="alert"></p><div class="md-actions"><button type="submit" class="md-primary">Save appeal decision</button></div></form>`}`);
}
function verify(next){
afterAction=typeof next==='function'?next:null;
modal('Verify staff access',`<p>Continue as <strong>${esc(actor())}</strong></p><div class="md-callout">In the live build, you’ll complete a fresh sign-in and two-factor check using your existing staff account. Staff membership is checked again before access is granted.</div><p class="md-muted">This design preview does not collect passwords or verification codes.</p><div class="md-actions">${button('Simulate successful verification','verified','','md-primary')}${button('Cancel','close-dialog')}</div>`);
}
function ipRule(){
if(state.role!=='admin')return;
modal('Add temporary network rule',`<form id="md-ip-form"><p class="md-muted">Sample configuration only. No traffic is blocked in this preview.</p><label for="md-ip">IP address</label><input id="md-ip" required placeholder="192.0.2.44"><label for="md-ip-action">Action</label><select id="md-ip-action"><option>Security challenge</option><option>Rate limit</option><option>Temporary block</option></select><label for="md-ip-duration">Expiry</label><select id="md-ip-duration"><option>1 hour</option><option>24 hours</option><option>7 days</option></select><label for="md-ip-reason">Reason</label><textarea id="md-ip-reason" required maxlength="1000"></textarea><div class="md-callout amber">Shared addresses can affect unrelated users. Prefer a challenge or rate limit where appropriate.</div><p class="md-error" id="md-form-error" role="alert"></p><div class="md-actions"><button type="submit" class="md-primary">Add sample rule</button></div></form>`);
}
function permissions(){modal('Staff permissions',`<div class="md-table-wrap"><table class="md-table"><thead><tr><th>Capability</th><th>Moderator</th><th>Admin</th></tr></thead><tbody>${[['Review reports / contact users','Yes','Yes'],['Warnings / temporary restrictions','Yes','Yes'],['Temporary suspensions','Yes','Yes'],['Permanent account bans','No','Yes'],['Hide a book pending review','Yes','Yes'],['Remove a public listing','No','Yes'],['Network restrictions / IP access','No','Yes'],['Manage staff membership','No','Yes'],['Erase audit history','No','No'],['Sanction protected staff accounts here','No','No']].map(r=>'<tr>'+r.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')}</tbody></table></div>`);}
function policy(){modal('Moderation guidelines',`<ul class="md-list">${['Review evidence before deciding. A report or AI detector score alone is not proof.','Keep the reporter’s identity and private staff notes separate from author messages.','Choose the narrowest appropriate restriction and record a clear reason.','Provide the user with the rule, effect, duration, and appeal route.','Hand off cases involving yourself, your own books, or a personal conflict.','Review missed correction deadlines; do not automatically ban an author for missing one.','Record reversals and preserve the case history.','Private manuscripts and exact reading histories are outside routine moderation views.'].map(t=>'<li>'+esc(t)+'</li>').join('')}</ul>`);}
function addNotice(uid,subject,text,bookId=''){const t={id:'t'+(++state.counter),user:uid,book:bookId,subject,caseId:'',unread:false,messages:[{side:'staff',text,time:'Just now'}]};threads.unshift(t);log('Official message sent',user(uid).name,'Message');return t;}
function error(text){$('#md-form-error').textContent=text;}
document.addEventListener('click',e=>{
const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action,id=b.dataset.id;
if(a==='close-dialog')return closeModal();
if(a==='verify')return verify();
if(a==='verified'){state.verified=true;const next=afterAction;afterAction=null;closeModal();if(next)next();else go('overview');return;}
if(a==='lock'){state.verified=false;afterAction=null;go('profile');return toast('Workspace locked. Verify again to enter.');}
if(a==='profile')return go('profile');
if(a==='navigate'){if(!state.verified)return verify(()=>go(id));return go(id);}
if(a==='new-users'){state.usersTab='new';state.period='1';state.q='';state.userStatus='all';return go('users');}
if(a==='users-tab'){state.usersTab=id;state.q='';state.userStatus='all';state.period='7';return render();}
if(a==='user')return openUser(id);
if(a==='case')return openCase(id);
if(a==='book')return openBook(id);
if(a==='thread'){state.thread=id;return go('conversations');}
if(a==='new-message')return messageForm();
if(a==='message-user')return messageForm(id);
if(a==='case-message'){const c=cases.find(c=>c.id===id);return messageForm(c.user,c.book,c.category==='tags'?'tags':c.category==='rating'?'rating':'clarify',c.id);}
if(a==='book-message'){const b=book(id);return messageForm(b.author,id,'tags');}
if(a==='account-action'){if(id.startsWith('ban:'))return verify(()=>accountAction(id));return accountAction(id);}
if(a==='book-action')return bookAction(id);
if(a==='recipient')return recipient(id);
if(a==='appeal')return openAppeal(id);
if(a==='new-appeal'){const u=user(id),existing=appeals.find(a=>a.user===id&&['Pending','Awaiting Information'].includes(a.status));return modal('Appeal an account restriction',existing?'<p>You already have an open appeal: '+esc(existing.id)+'.</p><p class="md-muted">You can add information by replying to your moderation conversation.</p>':`<form id="md-new-appeal" data-user="${id}"><p>${esc(u.name)} · ${esc(u.status)}</p><label for="md-new-appeal-text">What would you like staff to review?</label><textarea id="md-new-appeal-text" required maxlength="4000"></textarea><p class="md-muted">Appealing does not require restored posting permissions.</p><p class="md-error" id="md-form-error" role="alert"></p><div class="md-actions"><button type="submit" class="md-primary">Submit sample appeal</button></div></form>`);}
if(a==='handoff-appeal'){log('Appeal handed off',id);closeModal();toast('Appeal handed to another staff member.');return render();}
if(a==='policy')return policy();
if(a==='permissions')return permissions();
if(a==='ip-rule')return verify(ipRule);
if(a==='remove-ip'&&state.role==='admin'){const r=state.ipRules.find(r=>r.id===id);state.ipRules=state.ipRules.filter(r=>r.id!==id);log('Network rule removed',r.ip,'Security');render();toast('Sample rule removed.');}
});
document.addEventListener('change',e=>{
const id=e.target.id,v=e.target.value;
if(id==='md-role'){state.role=v;state.verified=true;closeModal();return render();}
const fields={'md-user-status':'userStatus','md-case-status':'caseStatus','md-case-reason':'caseReason','md-period':'period','md-active-period':'period','md-measure':'activeMeasure','md-start':'start','md-end':'end','md-book-status':'bookStatus'};
if(fields[id]){state[fields[id]]=v;return render();}
if(id==='md-template')return fillTemplate();
if(id==='md-message-book')return fillTemplate();
if(id==='md-message-user'){const select=$('#md-message-book');select.innerHTML='<option value="">Account message</option>'+books.filter(b=>b.author===v).map(b=>`<option value="${b.id}">${esc(b.title)}</option>`).join('');fillTemplate();}
});
document.addEventListener('input',e=>{
if(e.target.id==='md-user-search'){state.q=e.target.value;render();}
if(e.target.id==='md-audit-search'){state.auditQ=e.target.value;render();}
if(e.target.id==='md-reply-text')state.drafts[state.thread]=e.target.value;
});
document.addEventListener('submit',e=>{
const f=e.target;if(!f.id.startsWith('md-'))return;e.preventDefault();
if(f.id==='md-case-form'){
const c=cases.find(c=>c.id===f.dataset.case),conflict=user(c.user).name===actor(),assignee=$('#md-assignee').value,note=$('#md-case-note').value.trim(),status=$('#md-case-state').value;
if(conflict){if(assignee==='Unassigned'||assignee===actor())return error('Choose another staff member to receive this case.');c.assigned=assignee;c.history.unshift({what:'Handed off to '+assignee,by:actor(),when:'Just now'});log('Case handed off',c.id);closeModal();render();return toast('Case handed off.');}
if(['Resolved','Dismissed'].includes(status)&&note.length<10)return error('Explain the outcome in at least 10 characters before closing the case.');
c.status=status;c.assigned=assignee;c.due=$('#md-case-due').value;if(note)c.notes.push({text:note,by:actor()});c.history.unshift({what:'Status: '+status+(note?' · '+note:''),by:actor(),when:'Just now'});log('Case updated · '+status,c.id);closeModal();render();return toast('Case saved. No message was sent to the author.');
}
if(f.id==='md-message-form'){
const uid=$('#md-message-user').value,bid=$('#md-message-book').value,subject=$('#md-subject').value.trim(),text=$('#md-message-text').value.trim(),deadline=$('#md-message-deadline').value;
if(subject.length<3||text.length<10)return error('Add a subject and at least 10 characters of explanation.');
if(/\[[^\]]+\]/.test(text))return error('Replace the template placeholders before sending.');
const t=addNotice(uid,subject,text+(deadline?'\nRequested response date: '+deadline:''),bid);t.caseId=f.dataset.case||'';state.thread=t.id;go('conversations');return toast('Sample message delivered to the user inbox.');
}
if(f.id==='md-reply'){
const text=$('#md-reply-text').value.trim(),t=threads.find(t=>t.id===f.dataset.thread);if(text.length<10)return toast('Write at least 10 characters before sending.');
t.messages.push({side:'staff',text,time:'Just now'});state.drafts[t.id]='';log('Staff reply sent',user(t.user).name,'Message');render();return toast('Sample staff reply sent.');
}
if(f.id==='md-user-reply'){
const text=$('#md-user-reply-text').value.trim(),t=threads.find(t=>t.id===f.dataset.thread);if(text.length<10)return error('Write at least 10 characters.');
t.messages.push({side:'user',text,time:'Just now'});t.unread=true;closeModal();render();return toast('Sample user reply added to the staff conversation.');
}
if(f.id==='md-account-form'){
const u=user(f.dataset.user),kind=f.dataset.kind,note=$('#md-action-note').value.trim(),rule=$('#md-rule').value.trim(),features=[...f.querySelectorAll('[name=feature]:checked')].map(n=>n.value);
if(u.staff||kind==='ban'&&state.role!=='admin')return error('This action is unavailable.');
if(note.length<10||rule.length<3)return error('Enter a reason and at least 10 characters of explanation.');
if(kind==='restrict'&&!features.length)return error('Select at least one feature.');
if(kind==='ban'&&!$('#md-confirm-ban').checked)return error('Confirm that you intend to ban the account.');
const duration=$('#md-duration')?.value;
if(kind==='restrict'){u.restrictions=features;u.expires=duration;}
if(kind==='suspend'){u.status='Suspended';u.expires=duration;}
if(kind==='ban'){u.status='Banned';u.expires='Indefinite';}
if(kind==='restore'){u.status='Active';u.restrictions=[];u.expires='';}
const labels={warning:'Official policy warning',restrict:'Account feature restriction',suspend:'Account suspension',ban:'Account ban',restore:'Account access restored'};
addNotice(u.id,labels[kind],rule+'\n\n'+note+(duration?'\nDuration: '+duration:'')+'\nYou can reply to this conversation or appeal through the moderation inbox.');
log(labels[kind]+(duration?' · '+duration:''),u.name,'Account');closeModal();render();return toast('Sample account action recorded; book visibility is unchanged.');
}
if(f.id==='md-book-action'){
const b=book(f.dataset.book),kind=f.dataset.kind,note=$('#md-book-reason').value.trim();if(note.length<10)return error('Explain the reason in at least 10 characters.');
if(user(b.author).name===actor()||kind==='remove'&&state.role!=='admin')return error('This action is unavailable.');
b.status=kind==='restore'?'Visible':kind==='remove'?'Removed':'Hidden';log('Book visibility: '+b.status+' · '+note,b.title,'Book');closeModal();render();return toast('Sample visibility updated. Manuscript preserved.');
}
if(f.id==='md-appeal-form'){
const a=appeals.find(a=>a.id===f.dataset.appeal),decision=$('#md-appeal-decision').value,note=$('#md-appeal-note').value.trim();
if(note.length<10)return error('Explain the decision in at least 10 characters.');
if(a.originalActor===actor())return error('Another staff member must review this appeal.');
if(decision==='reverse'){user(a.user).status='Active';user(a.user).restrictions=[];a.status='Granted';}
else a.status=decision==='clarify'?'Awaiting Information':'Upheld';
addNotice(a.user,'Appeal '+a.id+' — '+a.status,note);log('Appeal '+a.status,a.id,'Appeal');closeModal();render();return toast('Sample appeal decision saved and sent to the user.');
}
if(f.id==='md-new-appeal'){const u=user(f.dataset.user),text=$('#md-new-appeal-text').value.trim();if(text.length<10)return error('Add at least 10 characters for staff to review.');const id='APL-'+(++state.counter);appeals.unshift({id,user:u.id,status:'Pending',action:u.status==='Active'?'Feature restriction':u.status,originalActor:actor(),text});audit.unshift({action:'Appeal submitted',target:id,actor:u.name,when:'Just now',type:'Appeal'});closeModal();render();return toast('Sample appeal submitted for another staff member to review.');}
if(f.id==='md-ip-form'){
if(state.role!=='admin')return error('Admin access required.');
const ip=$('#md-ip').value.trim(),reason=$('#md-ip-reason').value.trim();if(!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)||ip.split('.').some(n=>Number(n)>255))return error('Enter a valid sample IPv4 address.');
if(reason.length<10)return error('Explain the reason in at least 10 characters.');
state.ipRules.push({id:'ip'+(++state.counter),ip,reason,action:$('#md-ip-action').value,duration:$('#md-ip-duration').value});log('Temporary network rule added',ip,'Security');closeModal();render();return toast('Sample rule saved. No real traffic was blocked.');
}
});
$('#md-dialog').addEventListener('cancel',e=>{e.preventDefault();closeModal();});
window.modDesignPreview={sampleData:true};
render();
})();
