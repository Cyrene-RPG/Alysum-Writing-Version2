export const REPORT_REASONS=Object.freeze([
['suspected_ai','Suspected Use of AI'],['improper_tags','Improperly Tagged Book'],['incorrect_rating','Incorrect Age Rating'],['plagiarism','Suspected Plagiarism / Stolen Work'],['harassment','Harassment / Targeted Abuse'],['site_rules','Content Violating Site Rules'],['spam','Spam / Scam / Malicious Links'],['other','Other']
].map(([id,label])=>Object.freeze({id,label})));
export const REPORT_STATUSES=Object.freeze([['new','New'],['under_review','Under Review'],['resolved','Resolved'],['dismissed','Dismissed']].map(([id,label])=>Object.freeze({id,label})));
export const reasonLabel=id=>REPORT_REASONS.find(x=>x.id===id)?.label||'Other';
export const statusLabel=id=>REPORT_STATUSES.find(x=>x.id===id)?.label||'Unknown';
export function safeSupportingUrl(value){
    const raw=String(value||'').trim();if(!raw)return '';
    try{const url=new URL(raw);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||raw.length>2000)return null;return url.href;}catch{return null;}
}
export function validateReport(value,chapters=[]){
    if(!REPORT_REASONS.some(x=>x.id===value.reason))return 'Choose a reason for reporting.';
    const explanation=String(value.explanation||'').trim();
    if(explanation.length<10||explanation.length>4000)return 'Explain your concern in 10–4,000 characters.';
    if(value.reason==='improper_tags'&&!String(value.tagDetails||'').trim())return 'Tell staff which tags or warnings are missing or incorrect.';
    if(String(value.tagDetails||'').trim().length>1000)return 'Keep tag details to 1,000 characters.';
    if(value.chapterId&&!chapters.some(x=>String(x.id)===String(value.chapterId)))return 'Choose an available chapter or Whole book.';
    if(safeSupportingUrl(value.supportingUrl)===null)return 'Use a complete http or https link without sign-in credentials.';
    return '';
}
export function reportError(error){
    const code=String(error?.code||''),message=String(error?.message||'');
    if(code==='REPORT_SETUP'||code==='PGRST202'||code==='42P01'||/could not find.*function/i.test(message))return 'Reporting is not available yet. Please try again later.';
    return message||'Your report could not be sent. Your text is still here; please try again.';
}
