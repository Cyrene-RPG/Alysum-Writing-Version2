import {normalizeWarningState,warningSummary} from '/core/publishing/content-warnings.js';
export function renderContentWarnings(mount,raw,{legacy=[],chapters=[],chapterId='',collapsible=false}={}) {
    if(!mount)return;
    if(!document.querySelector("link[data-content-warning-styles]")){const link=document.createElement("link");link.rel="stylesheet";link.href="/site-appearance/css-styles/content-warnings.css";link.dataset.contentWarningStyles="";document.head.append(link);}
    mount.classList.add("content-warning-view");
    mount.replaceChildren();
    const state=normalizeWarningState(raw,legacy),summary=warningSummary(state,{chapters,chapterId});
    if(!summary.rows.length&&!summary.note&&!summary.noneApply){mount.hidden=true;return;}
    mount.hidden=false;let target=mount;
    if(collapsible){const detail=document.createElement('details'),heading=document.createElement('summary');heading.textContent='Content warnings';detail.append(heading);mount.append(detail);target=detail;}
    const list=document.createElement('ul');list.className='content-warning-summary';
    for(const item of summary.rows){const row=document.createElement('li'),label=document.createElement('strong'),context=document.createElement('span');label.textContent=item.label;context.textContent=item.context;row.append(label,context);list.append(row);}target.append(list);
    if(summary.noneApply){const p=document.createElement('p');p.className='content-warning-note';p.textContent='The author has marked that none of the core warnings apply. Additional warnings may still be listed.';target.append(p);}
    if(summary.note){const p=document.createElement('p');p.className='content-warning-note';p.textContent=summary.note;target.append(p);}
}
