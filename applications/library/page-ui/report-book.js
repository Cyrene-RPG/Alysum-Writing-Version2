import {createBookReportService} from '/core/book-reports/service.js';
import {mountBookReport} from '/site-appearance/components/book-report.js';
import {mountAiReportNotice} from '/site-appearance/components/ai-report-notice.js';
export function mountReporting({client,work,noticeHost}){
    const service=createBookReportService(client);
    const host=noticeHost||document.getElementById('bookAiNotice');
    const notice=host?mountAiReportNotice({host,book:work,service}):null;
    const button=document.getElementById('reportBookButton')||notice?.reportButton;
    const widget=mountBookReport({button,book:work,service,onSubmitted:()=>notice?.refresh()});
    if(notice && notice.reportButton!==button)notice.reportButton.addEventListener('click',()=>button.click());
    void notice?.refresh();
    client.auth.onAuthStateChange(()=>{notice?.reset();setTimeout(()=>{widget.reset();void notice?.refresh();},0);});
    void service.session().then(async session=>{
        if(!session)return;const access=await service.access();
        if(!access?.staff)return;
        const current=await service.session();if(current?.user?.id!==session.user.id)return;
        const menu=document.getElementById('welcomePfpDropdown');if(!menu||menu.querySelector('[data-book-reports-link]'))return;
        const link=document.createElement('a');link.href='/staff/book-reports';link.textContent='Book Reports';link.setAttribute('role','menuitem');link.dataset.bookReportsLink='';menu.prepend(link);
        client.auth.onAuthStateChange(()=>{setTimeout(()=>link.remove(),0);});
    }).catch(()=>{});
}
