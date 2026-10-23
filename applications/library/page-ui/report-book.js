import {createBookReportService} from '/core/book-reports/service.js';
import {mountBookReport} from '/site-appearance/components/book-report.js';
export function mountReporting({client,work}){
    const service=createBookReportService(client),widget=mountBookReport({button:document.getElementById('reportBookButton'),book:work,service});
    client.auth.onAuthStateChange(()=>{setTimeout(()=>widget.reset(),0);});
    void service.session().then(async session=>{
        if(!session)return;const access=await service.access();
        if(!access?.staff)return;
        const current=await service.session();if(current?.user?.id!==session.user.id)return;
        const menu=document.getElementById('welcomePfpDropdown');if(!menu||menu.querySelector('[data-book-reports-link]'))return;
        const link=document.createElement('a');link.href='/staff/book-reports';link.textContent='Book Reports';link.setAttribute('role','menuitem');link.dataset.bookReportsLink='';menu.prepend(link);
        client.auth.onAuthStateChange(()=>{setTimeout(()=>link.remove(),0);});
    }).catch(()=>{});
}
