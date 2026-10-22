import {validateReport,safeSupportingUrl} from './model.js';
export function createBookReportService(client){
    async function rpc(name,args={}){
        const {data,error}=await client.rpc(name,args);if(error)throw error;return data;
    }
    return {
        async session(){const {data,error}=await client.auth.getSession();if(error)throw error;return data?.session||null;},
        access:()=>rpc('book_reports_v2_access'),
        own:bookId=>rpc('book_reports_v2_own',{p_book_id:String(bookId)}),
        async submit(book,value,requestId){
            const issue=validateReport(value,book.chapters||[]);if(issue)throw Error(issue);
            return rpc('book_reports_v2_submit',{p_request_id:requestId,p_book_id:String(book.id),p_reason:value.reason,p_explanation:value.explanation.trim(),p_chapter_id:String(value.chapterId||''),p_tag_details:String(value.tagDetails||'').trim(),p_supporting_url:safeSupportingUrl(value.supportingUrl)});
        },
        async followup(id,text,requestId){const note=String(text||'').trim();if(note.length<10||note.length>4000)throw Error('Add 10–4,000 characters of information.');return rpc('book_reports_v2_followup',{p_report_id:id,p_text:note,p_request_id:requestId});},
        queue:(status='open',reason='',offset=0)=>rpc('book_reports_v2_queue',{p_status:status,p_reason:reason,p_offset:offset}),
        book:(bookId,offset=0)=>rpc('book_reports_v2_book',{p_book_id:bookId,p_offset:offset}),
        detail:(id,eventOffset=0)=>rpc('book_reports_v2_detail',{p_report_id:id,p_event_offset:eventOffset}),
        review:(id,status,note,version)=>rpc('book_reports_v2_review',{p_report_id:id,p_status:status,p_note:note,p_expected_version:version})
    };
}
