import {mountReportQueue} from './queue.js';
import {createReportPreviewService} from './preview-service.js';
const preview=createReportPreviewService({staff:true}),queue=mountReportQueue(preview.service);
const banner=document.createElement('aside');banner.className='br-preview-banner';banner.textContent='Sample staff queue — invented reports only. ';const link=document.createElement('a');link.href='/report-preview';link.textContent='Preview reporting a book';banner.append(link);document.body.prepend(banner);
window.reportStaffPreview={...preview,queue};void queue.start();
