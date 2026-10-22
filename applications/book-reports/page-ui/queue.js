import {REPORT_REASONS,REPORT_STATUSES,reasonLabel,statusLabel,safeSupportingUrl,reportError} from '/core/book-reports/model.js';
const date=value=>{const d=new Date(value);return Number.isNaN(d.valueOf())?'Unknown date':d.toLocaleString();};
function el(tag,text,attrs={}){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;for(const [key,value]of Object.entries(attrs))n.setAttribute(key,String(value));return n;}
function option(select,value,label){select.append(el('option',label,{value}));}
export function mountReportQueue(service,root=document){
    const $=s=>root.querySelector(s),content=$('#br-staff-content'),status=$('#br-staff-status'),groups=$('#br-groups'),reports=$('#br-book-reports'),detail=$('#br-report-detail');
    let generation=0,queueToken=0,bookToken=0,detailToken=0,offset=0,bookOffset=0,currentBook='',selectedId='',current=null,eventOffset=0;
    const reason=$('#br-filter-reason'),filter=$('#br-filter-status');
    for(const r of REPORT_REASONS)option(reason,r.id,r.label);
    function clear(){generation++;queueToken++;bookToken++;detailToken++;content.hidden=true;groups.replaceChildren();reports.replaceChildren();detail.replaceChildren();current=null;selectedId='';currentBook='';$('#br-staff-signin').hidden=true;status.textContent='Checking staff access…';}
    async function start(){clear();const v=generation;try{const session=await service.session();if(v!==generation)return;if(!session){status.textContent='Sign in with a staff account to view reports.';$('#br-staff-signin').hidden=false;return;}const access=await service.access();if(v!==generation)return;if(!access?.staff){status.textContent='Staff access is required to view reports.';return;}content.hidden=false;await loadQueue();}catch(error){if(v===generation)status.textContent=reportError(error);}}
    async function loadQueue(more=false){const v=generation,t=++queueToken;if(!more){offset=0;groups.replaceChildren();}$('#br-groups-more').hidden=true;status.textContent='Loading reports…';try{
        const data=await service.queue(filter.value,reason.value,offset);if(v!==generation||t!==queueToken)return;
        for(const book of data.items||[]){const card=el('article',undefined,{class:'br-card'}),b=el('button',undefined,{type:'button','aria-pressed':String(currentBook===book.bookId)});b.append(el('strong',book.title||'Untitled'),el('small',(book.author||'Unknown')+' · '+book.reportCount+' matching report(s) · '+book.newCount+' new'),el('small','Updated '+date(book.latestAt)));b.onclick=()=>loadBook(book.bookId);card.append(b);groups.append(card);}
        offset+=(data.items||[]).length;$('#br-groups-more').hidden=offset>=data.total;
        status.textContent=data.total?data.total+' book(s) match these filters.':'No reports match these filters.';
    }catch(error){if(v===generation&&t===queueToken)status.textContent=reportError(error);}}
    async function loadBook(bookId,more=false){const v=generation,t=++bookToken;if(!more){currentBook=bookId;bookOffset=0;reports.replaceChildren();detail.replaceChildren();selectedId='';current=null;detailToken++;}$('#br-book-more').hidden=true;reports.setAttribute('aria-busy','true');
        try{const data=await service.book(bookId,bookOffset);if(v!==generation||t!==bookToken)return;
            if(!more){reports.append(el('h2','Reports for this book'),el('p','All reports for the selected book, including closed reports.',{class:'br-muted'}));const link=el('a','Open book ↗',{href:'/book?id='+encodeURIComponent(bookId),target:'_blank',rel:'noopener noreferrer'});reports.append(link);}
            for(const report of data.items||[]){const card=el('div',undefined,{class:'br-card'}),b=el('button',undefined,{type:'button'});b.append(el('strong',reasonLabel(report.reason)),el('small',statusLabel(report.status)+' · '+date(report.created_at)),el('small',report.chapter_title||'Whole book'));b.onclick=()=>loadDetail(report.id);card.append(b);reports.append(card);}
            bookOffset+=(data.items||[]).length;$('#br-book-more').hidden=bookOffset>=data.total;
        }catch(error){if(v===generation&&t===bookToken)reports.append(el('p',reportError(error),{role:'alert'}));}finally{if(v===generation&&t===bookToken)reports.setAttribute('aria-busy','false');}}
    function field(label,text){detail.append(el('p',label,{class:'br-detail-label'}),el('p',text||'—',{class:'br-pre'}));}
    function eventRows(events,mount){for(const e of events){const li=el('li');li.append(el('strong',(e.kind==='followup'?'Reader added information':e.kind==='submitted'?'Report submitted':'Staff review')+' · '+(e.actor_name||'Deleted account')),el('p',date(e.created_at),{class:'br-muted'}));if(e.kind==='review')li.append(el('p',statusLabel(e.from_status)+' → '+statusLabel(e.to_status)));if(e.body)li.append(el('p',e.body,{class:'br-pre'}));mount.append(li);}}
    async function loadDetail(id,keepDraft=false){
        const draft=keepDraft?detail.querySelector('textarea')?.value||'':'',v=generation,t=++detailToken;selectedId=id;detail.setAttribute('aria-busy','true');
        try{const data=await service.detail(id);if(v!==generation||t!==detailToken)return;current=data.report;eventOffset=(data.events||[]).length;detail.replaceChildren();
            detail.append(el('h2','Report details'));field('Book',current.book_title);field('Reason',reasonLabel(current.reason));field('Reporter',data.reporter?(data.reporter.name+' · '+data.reporter.id):'Deleted account');field('Submitted',date(current.created_at));field('Chapter',current.chapter_title||'Whole book');field('Explanation',current.explanation);
            if(current.tag_details)field('Missing or incorrect tags',current.tag_details);
            const link=safeSupportingUrl(current.supporting_url);if(link){detail.append(el('p','Supporting link',{class:'br-detail-label'}),el('a',link,{href:link,target:'_blank',rel:'noopener noreferrer nofollow'}));}
            const form=el('form'),fields=el('fieldset');fields.style.border='0';fields.style.padding='0';fields.style.margin='0';const label=el('label','Status',{for:'br-review-status'}),select=el('select',undefined,{id:'br-review-status'});for(const s of REPORT_STATUSES)option(select,s.id,s.label);select.value=current.status;
            const noteLabel=el('label','Private staff note / outcome',{for:'br-review-note'}),note=el('textarea',undefined,{id:'br-review-note',maxlength:4000,rows:4});note.value=draft;
            const help=el('p','Notes stay private to staff. Record any action taken; changing report status does not change book visibility.',{class:'br-muted'}),save=el('button','Save review',{type:'submit',class:'br-primary'}),reload=el('button','Reload report',{type:'button'}),message=el('p','',{role:'status','aria-live':'polite'});
            reload.onclick=()=>loadDetail(id,true);fields.append(label,select,noteLabel,note,help,save,reload);form.append(fields,message);detail.append(form);
            form.onsubmit=async e=>{e.preventDefault();if(fields.disabled)return;fields.disabled=true;reload.disabled=true;const version=generation,token=detailToken;message.textContent='Saving review…';try{await service.review(id,select.value,note.value,current.version);if(version!==generation||token!==detailToken)return;await loadDetail(id);await loadQueue();await loadBookListOnly();}catch(error){if(version===generation&&token===detailToken)message.textContent=reportError(error);}finally{if(version===generation&&token===detailToken){fields.disabled=false;reload.disabled=false;}}};
            detail.append(el('h3','Review history'));const timeline=el('ol',undefined,{class:'br-list'});eventRows(data.events||[],timeline);detail.append(timeline);
            const more=el('button','Load earlier history',{type:'button'});more.hidden=eventOffset>=data.totalEvents;more.onclick=async()=>{more.disabled=true;try{const next=await service.detail(id,eventOffset);if(v!==generation||t!==detailToken)return;eventRows(next.events||[],timeline);eventOffset+=(next.events||[]).length;more.hidden=eventOffset>=next.totalEvents;}catch(error){if(v===generation&&t===detailToken)message.textContent=reportError(error);}finally{more.disabled=false;}};detail.append(more);
        }catch(error){if(v===generation&&t===detailToken){detail.replaceChildren(el('p',reportError(error),{role:'alert'}));}}finally{if(v===generation&&t===detailToken)detail.setAttribute('aria-busy','false');}}
    async function loadBookListOnly(){/* Keep the selected report and staff draft stable after a save. */if(!currentBook)return;const keep=selectedId;await loadBook(currentBook);if(keep)await loadDetail(keep);}
    $('#br-groups-more').onclick=()=>loadQueue(true);$('#br-book-more').onclick=()=>loadBook(currentBook,true);
    $('#br-staff-refresh').onclick=()=>{detailToken++;bookToken++;detail.replaceChildren();reports.replaceChildren();currentBook='';return loadQueue();};
    for(const control of [reason,filter])control.onchange=()=>{$('#br-staff-refresh').click();};
    return {start,clear};
}
