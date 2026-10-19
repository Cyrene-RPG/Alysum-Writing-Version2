import {buildManuscriptExportModel,createManuscriptDocument,manuscriptExportFilename} from '/core/writing-engine/manuscript-export.js';
import {parseManuscriptHtml} from './manuscript-html.js';
let libraryPromise;
export function loadDocxLibrary() {
    if(globalThis.docx?.Document)return Promise.resolve(globalThis.docx);
    if(!libraryPromise)libraryPromise=new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='https://cdn.jsdelivr.net/npm/docx@9.6.1/dist/index.iife.js';
        script.integrity='sha384-NFScaGYD8NnHsUV2z0M1gCuKoEsGy7LB1EuWKYFsmQbO4k23nzZzEHFySoCvt8Xn';
        script.crossOrigin='anonymous';script.referrerPolicy='no-referrer';
        const timer=setTimeout(()=>fail(),25000);
        function fail(){clearTimeout(timer);script.remove();libraryPromise=null;reject(Error('The Word export library could not load. Check your connection and try again.'));}
        script.onerror=fail;
        script.onload=()=>{clearTimeout(timer);if(globalThis.docx?.Document)resolve(globalThis.docx);else fail();};
        document.head.appendChild(script);
    });
    return libraryPromise;
}
export async function buildManuscriptDocx(book,details) {
    const model=buildManuscriptExportModel(book,details,parseManuscriptHtml);
    const docx=await loadDocxLibrary();
    const blob=await docx.Packer.toBlob(createManuscriptDocument(model,docx));
    return {blob,filename:manuscriptExportFilename(model.title),model};
}
export async function downloadManuscriptDocx(book,details) {
    const {blob,filename}=await buildManuscriptDocx(book,details);
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
}
