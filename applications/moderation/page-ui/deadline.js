export function officialBookDeadlineCallout(){
 return '<div class="md-callout">Sent as Alysum Moderation to the user’s on-site inbox. Visible to all staff. Private case notes and reporter identities are not attached. If you attach a book and a response date, and they do not reply by that date, the book is unpublished from the Library. It remains in Studio.</div>';
}

export function bookDeadlineStaffNote(thread){
 const book=thread?.book_id||thread?.bookId;
 const deadline=thread?.deadline;
 const resolved=thread?.resolved_at||thread?.resolvedAt;
 if(!book||!deadline||resolved||thread?.deadline_enforced_at||thread?.deadlineEnforcedAt)return '';
 return '<div class="md-callout">If they do not reply by this date, this book is unpublished from the Library. It remains in Studio.</div>';
}

export function bookDeadlineRecipientNote(thread){
 const book=thread?.bookId||thread?.book_id;
 const deadline=thread?.deadline;
 const resolved=thread?.resolvedAt||thread?.resolved_at;
 if(!book||!deadline||resolved||thread?.deadlineEnforcedAt)return '';
 return '<p class="md-muted">Reply by this date. If you do not, this book will be unpublished from the Library. Your Studio copy stays.</p>';
}
