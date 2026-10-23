import {moderationClient as client} from '/core/moderation/client.js';
import {createModerationService} from '/core/moderation/service.js';
import {esc,$,date,label,badge,button,title,table,formShell,field,select,modal,close,toast,showError,clearPrivate,bindDialog} from './common.js';
const api=createModerationService(client);
const state={view:location.pathname.includes('book-reports')?'reports':new URLSearchParams(location.search).get('view')||'dashboard',role:'',user:null,epoch:0,offset:0,filters:{},rows:[],selected:null,lastAction:Date.now(),busy:false};
const reasons=[['','All reasons'],['suspected_ai','Suspected Use of AI'],['improper_tags','Improperly Tagged Book'],['incorrect_rating','Incorrect Age Rating'],['plagiarism','Suspected Plagiarism / Stolen Work'],['harassment','Harassment / Targeted Abuse'],['site_rules','Content Violating Site Rules'],['spam','Spam / Scam / Malicious Links'],['other','Other']];
const templates={
 review:['Book under review','We’re reviewing your book following a reader concern. No decision has been made. We will contact you here with questions or an outcome.'],
 tags:['Please review your content warnings','Please review the tags and content warnings for your book, especially [chapter / content]. Reply here once you have checked them or if you need clarification.'],
 rating:['Age rating review','Please review the age rating for your published book. [Explain the specific concern.] Reply when you have checked the rating or if you need clarification.'],
 clarify:['Request for clarification','We received a concern about your book. No conclusion has been reached. Could you provide context about [specific concern]?'],
 warning:['Official policy warning','We are contacting you about [specific behavior] under [site rule]. Please [requested action]. You can reply here or appeal an account restriction.'],
 outcome:['Review outcome','Our review is complete. [Explain the finding, action, duration, and appeal route.]'],
 custom:['A message from Alysum Moderation','']
};
let factorId='',enrollment=null,oauthPending=sessionStorage.getItem('alysum-mod-oauth')==='1',fresh=false;
const call=(action,payload={},key)=>api.call(action,payload,key);
function gate(message=''){
 state.epoch++;state.role='';state.rows=[];state.selected=null;clearPrivate();$('#md-identity').textContent='Staff sign-in required';
 $('#md-screen').innerHTML=title('Staff sign-in','Sign in separately with your existing staff account. Your normal Alysum session stays separate.')+
 '<section class="md-panel" style="max-width:600px"><form id="mc-signin">'+field('mc-email','Email address','email')+field('mc-password','Password','password')+'<p class="md-error" data-form-error role="alert">'+esc(message)+'</p><div class="md-actions"><button type="submit" class="md-primary">Sign in to moderation</button></div></form><p class="md-muted">Or continue with your existing provider:</p><div class="md-heading-actions">'+button('Google','oauth','google')+button('Discord','oauth','discord')+'</div><p class="md-muted md-small">Two-factor verification is required for staff access.</p><a href="/overview">Back to profile</a></section>';
}
function mfaView(hasFactor){
 $('#md-screen').innerHTML=title('Verify staff identity','Use your authenticator app to complete the separate staff sign-in.')+
 '<section class="md-panel" style="max-width:600px">'+(hasFactor?formShell('mc-mfa',field('mc-code','Six-digit authenticator code','text'),'Verify and open moderation'):'<p>Set up an authenticator for your staff account to protect access to moderation tools.</p>'+button('Set up authenticator','enroll'))+'<div id="mc-enrollment"></div><p class="md-error" id="mc-page-error" role="alert"></p></section>';
 if($('#mc-code')){$('#mc-code').inputMode='numeric';$('#mc-code').autocomplete='one-time-code';$('#mc-code').maxLength=6;}
}
async function resume(){
 const token=++state.epoch;const {data,error}=await client.auth.getSession();if(error)throw error;if(!data?.session)return gate();
 state.user=data.session.user;const access=await call('access');if(token!==state.epoch)return;
 if(!access.role){await client.auth.signOut({scope:'local'});return gate('This account does not have staff access.');}
 if(access.verified){state.role=access.role;fresh=false;sessionStorage.removeItem('alysum-mod-oauth');return load();}
 if(!fresh&&!oauthPending)return gate('Please sign in again to verify this staff session.');
 const factors=await client.auth.mfa.listFactors();if(factors.error)throw factors.error;factorId=factors.data.totp?.find(f=>f.status==='verified')?.id||'';
 mfaView(Boolean(factorId));
}
async function unlock(){
 await call('start');oauthPending=false;sessionStorage.removeItem('alysum-mod-oauth');fresh=false;await resume();
}
async function lock(message='Your moderation workspace is locked.'){
 try{await call('end');}catch{}await client.auth.signOut({scope:'local'});fresh=false;oauthPending=false;gate(message);
}
function nav(){
 const pages=[['dashboard','Dashboard'],['reports','Book Reports'],['users','Users'],['books','Books'],['conversations','Conversations'],['appeals','Appeals'],['audit','Audit Log'],...(state.role==='admin'?[['security','Staff & Security']]:[])];
 $('#md-nav').innerHTML=pages.map(([v,n])=>'<button data-live="nav" data-id="'+v+'" '+(state.view===v?'aria-current="page"':'')+'>'+n+'</button>').join('');
 $('#md-identity').textContent=label(state.role)+' · Verified';
}
async function go(view){close();state.view=view;state.offset=0;state.filters={};state.rows=[];const url=new URL(location.href);url.searchParams.set('view',view);history.replaceState(null,'',url);await load();window.scrollTo(0,0);}
function controls(){
 let fields='';
 if(state.view==='users')fields=select('mc-view','View',[['all','All users'],['new','New users'],['active','Most active']],state.filters.view||'all')+field('mc-query','Search name or username','search',state.filters.query||'')+select('mc-user-status','Account status',[['all','All statuses'],['Active','Active'],['Suspended','Suspended'],['Banned','Banned']],state.filters.status||'all')+select('mc-days','Activity period',[['7','Last 7 days'],['30','Last 30 days']],String(state.filters.days||7))+select('mc-measure','Rank active users by',[['activeDays','Active days'],['readingDays','Reading days'],['writingDays','Writing days'],['communityActions','Community actions']],state.filters.measure||'activeDays')+field('mc-from','Joined from (optional)','date',state.filters.from||'')+field('mc-through','Joined through (optional)','date',state.filters.through||'');
 if(state.view==='reports')fields=select('mc-status','Status',[['open','Open reports'],['all','All statuses'],['new','New'],['under_review','Under Review'],['awaiting_changes','Awaiting Changes'],['resolved','Resolved'],['dismissed','Dismissed']],state.filters.status||'open')+select('mc-reason','Reason',reasons,state.filters.reason||'');
 if(state.view==='books')fields=field('mc-query','Search book title','search',state.filters.query||'')+select('mc-status','Visibility',[['all','All visibility'],['visible','Visible'],['hidden','Hidden'],['removed','Removed']],state.filters.status||'all');
 if(['conversations','audit'].includes(state.view))fields=field('mc-query','Search','search',state.filters.query||'');
 return fields?'<form id="mc-filter" class="md-toolbar">'+fields+'<button type="submit">Apply filters</button></form>':'';
}
async function load(more=false){
 const token=++state.epoch;nav();
 if(!more)$('#md-screen').innerHTML=title(label(state.view),'Loading current data…')+'<p id="mc-page-error" class="md-error" role="alert"></p>';
 try{
 if(state.view==='dashboard'){const data=await call('dashboard');if(token!==state.epoch)return;$('#md-screen').innerHTML=title('Dashboard','Live reports, user activity, author replies, and appeals.')+
 '<div class="md-metrics">'+[['openReports','Open book reports','reports'],['unassigned','Unassigned reports','reports'],['newUsers','New users today','users'],['authorReplies','User replies','conversations'],['pendingAppeals','Pending appeals','appeals'],['users','All accounts','users']].map(([k,l,v])=>'<button class="md-metric" data-live="nav" data-id="'+v+'"><span>'+l+'</span><strong>'+Number(data[k]||0)+'</strong><small>Open '+v+'</small></button>').join('')+'</div><section class="md-panel"><h2>Your staff workspace</h2><p class="md-muted">Reports do not automatically remove books. Case notes stay private; contact users through Conversations. Activity metrics begin when this tracking is installed.</p></section>';return;}
 if(state.view==='security'){const [staff,ips]=await Promise.all([call('staff'),call('ips')]);if(token!==state.epoch)return;state.rows=ips.items;$('#md-screen').innerHTML=title('Staff & Security','Admin-only access. Changes are audited. Temporary IP blocks take a few seconds to update.',button('Add IP block','ip-add')+button('Manage staff','staff-edit'))+
 table(['Staff member','Role'],staff.items.map(u=>[esc(u.name)+'<small>'+esc(u.id)+'</small>',badge(u.role)]))+
 table(['IP address','Reason','Expiry','State',''],ips.items.map(r=>[esc(r.address),esc(r.reason),date(r.expires_at),badge(r.revoked_at?'revoked':new Date(r.expires_at)>new Date()?'active':'expired'),!r.revoked_at?button('Remove block','ip-remove',r.id):'']))+
 '<p class="md-muted md-small">A shared IP is not proof of account ownership. These blocks apply to Cloudflare website traffic; they do not replace account restrictions. A database outage does not take the public site offline.</p>';return;}
 const action=state.view;const data=await call(action,{...state.filters,offset:more?state.rows.length:0});if(token!==state.epoch)return;
 state.rows=more?[...state.rows,...data.items]:data.items||[];
 const rows=state.rows;let body='';
 if(action==='users')body=table(['User','Type','Joined / last active','Active / reading / writing days','Community','Status'],rows.map(u=>[button(u.name,'user',u.id,'md-text-button')+'<small>@'+esc(u.username)+'</small>',esc(u.accountType),date(u.joinedAt)+'<small>'+date(u.lastSeenAt)+'</small>',[u.activeDays,u.readingDays,u.writingDays].map(Number).join(' / '),String(Number(u.communityActions)),badge(u.status)]));
 if(action==='reports')body=table(['Book / report','Reason','Status','Assigned','Updated'],rows.map(r=>[button(r.book_title,'report',r.id,'md-text-button')+'<small>'+esc(r.id)+'</small>',esc(reasons.find(x=>x[0]===r.reason)?.[1]||label(r.reason)),badge(r.phase),r.assigned_id?esc(r.assigned_name):'Unassigned',date(r.updated_at)]));
 if(action==='books')body=table(['Book','Author','Chapters','Reports','Visibility',''],rows.map(b=>[esc(b.title||'Untitled')+'<small>'+esc(b.id)+'</small>',button(b.author||'Author','user',b.user_id,'md-text-button'),String(b.chapters),String(b.reports),badge(b.visibility),button('Review book','book',b.id)]));
 if(action==='conversations')body=table(['Conversation','User','Updated',''],rows.map(t=>[button(t.subject,'thread',t.id,'md-text-button')+(t.unread?'<small>New user reply</small>':''),esc(t.recipient_name),date(t.updated_at),t.book_id?esc(t.book_id):'Account message']));
 if(action==='appeals')body=table(['User','Restriction','Status','Submitted',''],rows.map(a=>[esc(a.username),esc(label(a.kind))+'<small>'+esc(a.reason)+'</small>',badge(a.status),date(a.created_at),button('Review appeal','appeal',a.id)]));
 if(action==='audit')body=table(['Action','Subject','Staff member','When'],rows.map(a=>[esc(a.action),esc(a.target),esc(a.actor_name),date(a.created_at)]));
 $('#md-screen').innerHTML=title(action==='reports'?'Book Reports':label(action),action==='users'?'Live accounts, including profiles that are not completed yet. Activity counts use distinct days; refreshes do not inflate them. Dates use America/Los_Angeles.':action==='audit'?'Audit records cannot be edited or deleted through staff tools.':'Current records from the site.',action==='conversations'?button('New staff message','new-message'):'')+controls()+'<p id="mc-page-error" class="md-error" role="alert"></p>'+body+(rows.length<data.total?button('Load more','more'):'');
 for(const input of document.querySelectorAll('#mc-filter input'))input.required=false;
 }catch(error){if(token!==state.epoch)return;showError(error);if(/Fresh staff verification|fresh staff sign-in|Sign in to continue/.test(error.message))await lock('Please verify your staff session again.');}
}
async function userDetail(id){
 const data=await call('user',{id});state.selected={kind:'user',data};
 modal(data.name,'<p>@'+esc(data.username)+' · '+badge(data.status)+'</p><p class="md-muted">'+esc(data.id)+'</p><div class="md-details"><div><small>Joined</small><strong>'+date(data.joinedAt)+'</strong></div><div><small>Last active</small><strong>'+date(data.lastSeenAt)+'</strong></div></div>'+
 (data.protected?'<div class="md-callout">Protected staff account. Sanctions are unavailable here.</div>':'<div class="md-actions">'+button('Send message','message-user',id)+button('Issue warning / restriction','sanction',id)+'</div>')+
 '<h3>Published books</h3>'+data.books.map(b=>'<p>'+esc(b.title)+' <a href="/book?id='+encodeURIComponent(b.id)+'" target="_blank" rel="noopener noreferrer">Open book ↗</a></p>').join('')+
 '<h3>Account history</h3>'+data.sanctions.map(s=>'<div class="md-item"><strong>'+esc(label(s.kind))+'</strong> '+badge(s.revokedAt?'revoked':s.expiresAt&&new Date(s.expiresAt)<new Date()?'expired':'active')+'<p>'+esc(s.reason)+'</p><p class="md-pre">'+esc(s.explanation)+'</p><p class="md-muted md-small">By '+esc(s.createdBy)+' · '+date(s.createdAt)+' · Expires '+date(s.expiresAt)+'</p>'+(!s.revokedAt?button('Reverse this action','revoke',s.id):'')+'</div>').join(''));
}
async function reportDetail(id,eventsOffset=0){
 const data=await call('report',{id,offset:eventsOffset});state.selected={kind:'report',data};
 const r=data.report,m=data.caseMeta||{};
 modal('Report: '+r.book_title,'<p>'+badge(m.phase||r.status)+' · '+esc(r.id)+'</p><p><strong>Reporter (staff only):</strong> '+esc(data.reporter?.name||'Deleted account')+'</p><p><strong>Chapter:</strong> '+esc(r.chapter_title||'Whole book')+'</p><p class="md-pre">'+esc(r.explanation)+'</p>'+(r.tag_details?'<p class="md-pre"><strong>Tag details:</strong> '+esc(r.tag_details)+'</p>':'')+
 (data.conflict?'<div class="md-callout amber">This case involves your account or book. You can only hand it to another staff member.</div>':'')+
 formShell('mc-report-form',select('mc-assignee','Assigned staff',[['','Unassigned'],...data.staff.map(s=>[s.id,s.name])],m.assigned_id||'')+
 (data.conflict?'':select('mc-report-status','Status',[['new','New'],['under_review','Under Review'],['awaiting_changes','Awaiting Changes'],['resolved','Resolved'],['dismissed','Dismissed']],m.phase||r.status)+field('mc-follow-up','Follow-up date (optional)','date',m.follow_up_at||''))+
 field('mc-note',data.conflict?'Handoff note':'Private staff note / outcome'),'Save case')+
 (!data.conflict&&data.ownerId?'<div class="md-actions">'+button('Contact author','report-message',id)+'</div>':'')+
 '<h3>Private case history</h3>'+data.events.map(e=>'<div class="md-item"><strong>'+esc(label(e.kind))+' · '+esc(e.actor_name)+'</strong><p>'+esc(e.body)+'</p><small class="md-muted">'+date(e.created_at)+'</small></div>').join('')+
 (eventsOffset+data.events.length<data.totalEvents?button('Earlier history','report-history',String(eventsOffset+data.events.length)):''));
 if($('#mc-follow-up'))$('#mc-follow-up').required=false;
}
function messageForm(userId='',bookId='',reportId=''){
 modal('New official message',formShell('mc-message-form',
 field('mc-recipient','Recipient account ID','text',userId)+field('mc-message-book','Related book ID (optional)','text',bookId)+
 select('mc-template','Template',Object.entries(templates).map(([v,t])=>[v,t[0]]),'custom')+field('mc-subject','Subject','text','A message from Alysum Moderation')+field('mc-message','Message the user will receive')+field('mc-deadline','Response date (optional)','date')+
 '<div class="md-callout">Sent as Alysum Moderation to the user’s on-site inbox. Private case notes and reporter identities are not attached.</div>','Send official message','data-report="'+esc(reportId)+'"'));
 $('#mc-message-book').required=false;$('#mc-deadline').required=false;
}
async function threadDetail(id,offset=0,older=[]){
 const data=await call('conversation',{id,offset});state.selected={kind:'thread',data};
 const messages=[...data.messages,...older];modal(data.thread.subject,'<p class="md-muted">To '+esc(data.recipientName)+' · '+esc(data.thread.book_id||'Account conversation')+'</p><div class="md-messages">'+messages.map(m=>'<article class="md-message '+esc(m.side)+'"><strong>'+esc(m.side==='staff'?'Alysum Moderation':data.recipientName)+'</strong><p>'+esc(m.body)+'</p><small>'+date(m.created_at)+(m.side==='staff'?' · Staff sender: '+esc(m.sender_name):'')+'</small></article>').join('')+'</div>'+formShell('mc-thread-form',field('mc-reply','Reply as Alysum Moderation'),'Send reply')+(offset+data.messages.length<data.total?button('Load earlier messages','thread-more',String(offset+data.messages.length)):''));
 state.selected.messages=messages;
}
function sanctionForm(id){
 const options=[['warning','Official warning'],['commenting','Restrict commenting'],['publishing','Restrict publishing'],['announcements','Restrict announcements'],['suspension','Suspend normal account access'],...(state.role==='admin'?[['ban','Permanent account ban']]:[])];
 modal('Account warning or restriction',formShell('mc-sanction-form',select('mc-sanction-kind','Action',options)+select('mc-duration','Duration for temporary restrictions',[['1','24 hours'],['7','7 days'],['30','30 days']],'7')+field('mc-rule','Relevant rule or reason','text')+field('mc-explanation','Explanation the user will receive')+'<div class="md-callout amber">Account restrictions do not change book visibility. The user can still access moderation conversations and appeals. A permanent ban has no expiry.</div><label><input id="mc-confirm-action" type="checkbox" required> I have reviewed the evidence and intend to apply this action.</label>','Apply account action','data-user="'+esc(id)+'"'));
}
function bookForm(id){
 const b=state.rows.find(b=>b.id===id);state.selected={kind:'book',data:b};
 modal('Review book visibility',formShell('mc-book-form','<p><strong>'+esc(b.title)+'</strong></p>'+select('mc-visibility','Public visibility',[['visible','Visible'],['hidden','Hidden pending review'],...(state.role==='admin'?[['removed','Removed from public view']]:[])],b.visibility)+field('mc-explanation','Reason / outcome')+'<div class="md-callout">This changes public visibility only. The author’s manuscript is preserved. No message is sent unless you choose to contact the author.</div>','Update visibility','data-book="'+esc(id)+'"'));
}
function appealForm(id){
 const a=state.rows.find(a=>a.id===id);state.selected={kind:'appeal',data:a};
 modal('Review appeal','<p><strong>'+esc(a.username)+'</strong> · '+esc(label(a.kind))+'</p><p class="md-pre">'+esc(a.body)+'</p><p class="md-muted">Original decision by '+esc(a.original_actor)+'</p>'+formShell('mc-appeal-form',select('mc-decision','Decision',[['awaiting_information','Request clarification'],['upheld','Uphold decision'],['granted','Reverse restriction']])+field('mc-explanation','Explanation the user will receive'),'Save decision and notify user'));
}
async function action(name,id){
 if(name==='close')return close();if(name==='lock')return lock();if(name==='nav')return go(id);if(name==='more')return load(true);
 if(name==='oauth'){sessionStorage.setItem('alysum-mod-oauth','1');const {error}=await client.auth.signInWithOAuth({provider:id,options:{redirectTo:location.origin+'/moderation',queryParams:{prompt:id==='google'?'select_account':'consent'}}});if(error)throw error;return;}
 if(name==='enroll'){
 const {data,error}=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Alysum Moderation'});if(error)throw error;enrollment=data;factorId=data.id;mfaView(true);
 const area=$('#mc-enrollment'),p=document.createElement('p'),img=document.createElement('img');p.textContent='Scan this code in your authenticator, then enter a generated code above.';img.alt='Authenticator setup QR code';img.style.maxWidth='220px';img.src=data.totp.qr_code;area.append(p,img);
 const labelNode=document.createElement('label');labelNode.textContent='Setup key (keep private)';const input=document.createElement('input');input.readOnly=true;input.value=data.totp.secret;area.append(labelNode,input);return;
 }
 if(name==='user')return userDetail(id);if(name==='report')return reportDetail(id);if(name==='report-history')return reportDetail(state.selected.data.report.id,Number(id));
 if(name==='new-message')return messageForm();if(name==='message-user')return messageForm(id);if(name==='report-message'){const d=state.selected.data;return messageForm(d.ownerId,d.report.book_id,d.report.id);}
 if(name==='thread')return threadDetail(id);if(name==='thread-more')return threadDetail(state.selected.data.thread.id,Number(id),state.selected.messages);
 if(name==='sanction')return sanctionForm(id);if(name==='revoke')return modal('Reverse an account action',formShell('mc-revoke-form',field('mc-explanation','Reason the user will receive'),'Reverse action','data-sanction="'+esc(id)+'"'));
 if(name==='book')return bookForm(id);if(name==='appeal')return appealForm(id);
 if(name==='staff-edit')return modal('Manage staff access',formShell('mc-staff-form',field('mc-staff-id','Existing account ID','text')+select('mc-staff-role','Staff access',[['moderator','Moderator'],['admin','Admin'],['none','Remove access']])+field('mc-explanation','Reason for the access change')+'<div class="md-callout">You cannot change your own role. A change immediately invalidates the affected user’s moderation sessions.</div>','Update staff access'));
 if(name==='ip-add')return modal('Temporary IP block',formShell('mc-ip-form',field('mc-ip','Single IPv4 or IPv6 address','text')+select('mc-ip-hours','Block duration',[['1','1 hour'],['24','24 hours'],['168','7 days']])+field('mc-explanation','Reason for blocking this connection')+'<div class="md-callout amber">Shared IP addresses may affect unrelated users. This blocks the website connection and automatically expires.</div>','Add temporary block'));
 if(name==='ip-remove')return modal('Remove IP block',formShell('mc-ip-remove-form',field('mc-explanation','Reason for removing this block'),'Remove block','data-rule="'+esc(id)+'"'));
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-live]');if(!b)return;state.lastAction=Date.now();void action(b.dataset.live,b.dataset.id).catch(showError);});
document.addEventListener('change',e=>{if(e.target.id==='mc-template'){const t=templates[e.target.value];$('#mc-subject').value=t[0];$('#mc-message').value=t[1];}});
document.addEventListener('submit',async e=>{
 const f=e.target;if(!f.id.startsWith('mc-'))return;e.preventDefault();if(state.busy)return;state.busy=true;const token=state.epoch;const buttons=[...f.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);const issue=f.querySelector('[data-form-error]');if(issue)issue.textContent='';
 try{
 if(f.id==='mc-signin'){fresh=true;const {error}=await client.auth.signInWithPassword({email:$('#mc-email').value.trim(),password:$('#mc-password').value});$('#mc-password').value='';if(error)throw error;await resume();return;}
 if(f.id==='mc-mfa'){const {error}=await client.auth.mfa.challengeAndVerify({factorId,code:$('#mc-code').value.trim()});if(error)throw error;enrollment=null;await unlock();return;}
 if(f.id==='mc-filter'){state.filters={query:$('#mc-query')?.value||'',view:$('#mc-view')?.value||'',status:$('#mc-status')?.value||$('#mc-user-status')?.value||'all',reason:$('#mc-reason')?.value||'',days:Number($('#mc-days')?.value||7),measure:$('#mc-measure')?.value||'activeDays',from:$('#mc-from')?.value||'',through:$('#mc-through')?.value||''};state.offset=0;await load();return;}
 let method,payload;const text=()=>$('#mc-explanation')?.value.trim()||'';
 if(f.id==='mc-sanction-form'){method='sanction';payload={userId:f.dataset.user,kind:$('#mc-sanction-kind').value,days:Number($('#mc-duration').value),reason:$('#mc-rule').value.trim(),body:text()};}
 if(f.id==='mc-revoke-form'){method='revoke_sanction';payload={id:f.dataset.sanction,body:text()};}
 if(f.id==='mc-message-form'){method='message';payload={userId:$('#mc-recipient').value.trim(),bookId:$('#mc-message-book').value.trim(),reportId:f.dataset.report,subject:$('#mc-subject').value.trim(),body:$('#mc-message').value.trim(),deadline:$('#mc-deadline').value};}
 if(f.id==='mc-thread-form'){method='staff_reply';payload={threadId:state.selected.data.thread.id,body:$('#mc-reply').value.trim()};}
 if(f.id==='mc-report-form'){method='report_save';payload={id:state.selected.data.report.id,version:state.selected.data.report.version,assignee:$('#mc-assignee').value,status:$('#mc-report-status')?.value||state.selected.data.report.status,followUp:$('#mc-follow-up')?.value||'',body:$('#mc-note').value.trim()};}
 if(f.id==='mc-book-form'){method='book_visibility';payload={bookId:f.dataset.book,visibility:$('#mc-visibility').value,body:text()};}
 if(f.id==='mc-appeal-form'){method='appeal_decision';payload={id:state.selected.data.id,version:state.selected.data.version,decision:$('#mc-decision').value,body:text()};}
 if(f.id==='mc-staff-form'){method='set_staff';payload={userId:$('#mc-staff-id').value.trim(),role:$('#mc-staff-role').value,body:text()};}
 if(f.id==='mc-ip-form'){method='ip_add';payload={address:$('#mc-ip').value.trim(),hours:Number($('#mc-ip-hours').value),body:text()};}
 if(f.id==='mc-ip-remove-form'){method='ip_remove';payload={id:f.dataset.rule,body:text()};}
 if(!method)return;
 const result=await call(method,payload,f.dataset.requestId);if(token!==state.epoch)return;
 close();await load();toast(method==='message'?'Official message delivered to the user’s on-site inbox.':'Saved. The action is recorded in the audit log.');
 }catch(error){showError(error);}finally{state.busy=false;buttons.forEach(b=>b.disabled=false);}
});
bindDialog();client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')setTimeout(()=>gate(),0);});
for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>state.lastAction=Date.now(),{passive:true});
let lastKeepalive=0;
setInterval(()=>{if(!state.role)return;if(Date.now()-state.lastAction>900000){void lock('The staff session expired after inactivity.');return;}if(Date.now()-lastKeepalive>120000&&Date.now()-state.lastAction<60000){lastKeepalive=Date.now();void call('access').then(d=>{if(!d.verified)void lock();else return call('dashboard');}).catch(()=>{});}},10000);
window.addEventListener('pagehide',clearPrivate);
void resume().catch(error=>gate(error.message));

window.addEventListener('pageshow',event=>{if(event.persisted)void resume().catch(error=>gate(error.message));});
