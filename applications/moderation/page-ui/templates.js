export const officialTemplates={
 review:['Book under review','We’re reviewing your book following a reader concern. No decision has been made. We will contact you here with questions or an outcome.'],
 cover:['Please update your book cover','Please update the cover for your published book. [Explain the specific concern.] Reply here once you have changed it or if you need clarification.'],
 tags:['Please review your content warnings','Please review the tags and content warnings for your book, especially [chapter / content]. Reply here once you have checked them or if you need clarification.'],
 rating:['Age rating review','Please review the age rating for your published book. [Explain the specific concern.] Reply when you have checked the rating or if you need clarification.'],
 clarify:['Request for clarification','We received a concern about your book. No conclusion has been reached. Could you provide context about [specific concern]?'],
 warning:['Official policy warning','We are contacting you about [specific behavior] under [site rule]. Please [requested action]. You can reply here or appeal an account restriction.'],
 outcome:['Review outcome','Our review is complete. [Explain the finding, action, duration, and appeal route.]'],
 custom:['A message from Alysum Moderation','']
};

export function leftoverFillIns(text){
 return [...String(text||'').matchAll(/\[[^\][]+\]/g)].map(match=>match[0]);
}

export function leftoverFillInMessage(text){
 const leftover=leftoverFillIns(text);
 if(!leftover.length)return '';
 return 'Replace leftover fill-in notes '+leftover.join(' ')+'. Delete the square brackets after you fill those in.';
}

export function officialTemplateHint(text){
 if(leftoverFillIns(text).length)return 'This template has [bracketed] fill-in notes. Replace those notes and delete the brackets before sending.';
 if(!String(text||'').trim())return 'Write the message the user should receive.';
 return 'This template is ready to send.';
}
