import {supabase} from '/core/authentication/client.js';
import {createBookReportService} from '/core/book-reports/service.js';
import {mountReportQueue} from './queue.js';
const queue=mountReportQueue(createBookReportService(supabase));
void queue.start();
supabase.auth.onAuthStateChange(()=>{queue.clear();setTimeout(()=>void queue.start(),0);});
window.addEventListener('pagehide',()=>queue.clear());
window.addEventListener('pageshow',event=>{if(event.persisted)void queue.start();});
