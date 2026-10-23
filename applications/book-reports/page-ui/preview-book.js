import {mountBookReport} from '/site-appearance/components/book-report.js';
import {mountAiReportNotice} from '/site-appearance/components/ai-report-notice.js';
import {createReportPreviewService,sampleBook} from './preview-service.js';
const preview=createReportPreviewService({aiNotice:new URLSearchParams(location.search).get('ai')==='1'});const book=sampleBook;
document.getElementById('bookPage').hidden=false;document.getElementById('bookTitle').textContent=book.title;document.getElementById('bookAuthor').textContent=book.author;document.getElementById('bookMeta').textContent='2 sample chapters';
document.getElementById('bookSynopsis').textContent='A sample book for trying the report flow. Reports in this preview never reach staff or the live database.';
document.getElementById('bookSynopsis').classList.remove('clipped');document.getElementById('synopsisFade').hidden=true;document.getElementById('readCta').hidden=true;
const chapters=document.getElementById('chapterList');for(const c of book.chapters){const p=document.createElement('p');p.textContent=c.title;chapters.append(p);}
const noticeHost=document.createElement('div');document.getElementById('bookHero').after(noticeHost);
const notice=mountAiReportNotice({host:noticeHost,book,service:preview.service});
const widget=mountBookReport({button:document.getElementById('reportBookButton'),book,service:preview.service,onSubmitted:()=>notice.refresh()});
notice.reportButton.onclick=()=>document.getElementById('reportBookButton').click();void notice.refresh();
const banner=document.createElement('aside');banner.className='br-preview-banner';banner.textContent='Sample reporting preview — nothing is sent. ';const link=document.createElement('a');link.href='/report-staff-preview';link.textContent='Preview the staff queue';banner.append(link);document.body.prepend(banner);
window.reportPreview={...preview,widget,notice};
