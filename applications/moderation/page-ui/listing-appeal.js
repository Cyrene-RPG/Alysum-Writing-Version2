import {esc,date,label,badge,button,formShell,field} from './common.js';

export function listingAppealSection(listings){
 if(!listings?.length)return '';
 return '<section class="md-panel"><h2>Library listings</h2>'+listings.map(item=>'<div class="md-item"><strong>'+esc(item.subject||'Library listing')+'</strong><p>This book was unpublished from the Library after the response date. Your Studio copy is unchanged.</p><small class="md-muted">Removed '+date(item.enforcedAt)+'</small><div class="md-actions">'+(['pending','awaiting_information'].includes(item.appealStatus)?badge('Appeal '+label(item.appealStatus)):button('Submit appeal ticket','listing-appeal',item.id))+'</div></div>').join('')+'</section>';
}

export function listingAppealThreadNote(thread,listings){
 if(!thread?.deadlineEnforcedAt)return '';
 if(['pending','awaiting_information'].includes(thread.listingAppealStatus))return '<p class="md-muted">An appeal ticket for this listing is with staff.</p>';
 if(Array.isArray(listings)&&!listings.some(item=>item.id===thread.id))return '';
 return '<div class="md-actions">'+button('Submit appeal ticket','listing-appeal',thread.id)+'</div>';
}

export function listingAppealForm(thread){
 return formShell('mc-listing-appeal','<p><strong>'+esc(thread.subject)+'</strong></p><p class="md-muted">Ask staff to restore this book to the Library. Your Studio copy is unchanged.</p>'+field('mc-user-body','What would you like staff to review?'),'Submit appeal ticket','data-thread="'+esc(thread.id)+'"');
}

export function appealKindLabel(kind){
 return kind==='listing'?'Library listing':label(kind);
}

export function appealGrantLabel(kind){
 return kind==='listing'?'Restore library listing':'Reverse restriction';
}
