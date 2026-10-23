/** Reader-only report notice. The server decides eligibility without exposing report data. */
export function mountAiReportNotice({host,book,service}) {
    const notice=document.createElement('aside'); notice.className='br-ai-notice'; notice.hidden=true;
    notice.setAttribute('aria-label','Suspected AI use notice'); notice.setAttribute('aria-live','polite');
    const heading=document.createElement('h2'); heading.textContent='Suspected AI use';
    const message=document.createElement('p');
    message.textContent='This book has been reported by multiple readers for suspected AI-generated or AI-assisted writing. These reports are not a confirmed finding. Read at your discretion. If you independently share this concern, please report the book to help protect our community.';
    const actions=document.createElement('div'),reportButton=document.createElement('button'),dismiss=document.createElement('button');
    reportButton.type=dismiss.type='button'; reportButton.textContent='Report book'; dismiss.textContent='Dismiss';
    actions.append(reportButton,dismiss); notice.append(heading,message,actions); host.append(notice);
    let epoch=0,key='',dismissed=false;
    const storage={get(key){try{return window.sessionStorage.getItem(key);}catch{return null;}},set(key){try{window.sessionStorage.setItem(key,'1');}catch{/* Dismissal still works in this page. */}}};
    dismiss.addEventListener('click',()=>{dismissed=true;notice.hidden=true;if(key)storage.set(key);});
    function reset(){epoch++;notice.hidden=true;key='';dismissed=false;}
    async function refresh(){
        const request=++epoch;notice.hidden=true;
        try {
            const session=await service.session();if(request!==epoch)return;
            const uid=session?.user?.id||'';
            const nextKey=`alysum:ai-report-notice:v1:${uid||'guest'}:${book.id}`;
            if(nextKey!==key){key=nextKey;dismissed=storage.get(key)==='1';}
            if(dismissed || uid && uid===book.ownerUserId)return;
            const show=await service.aiNotice(book.id);if(request!==epoch)return;
            const current=await service.session();if(request!==epoch || (current?.user?.id||'')!==uid)return;
            notice.hidden=show!==true || dismissed;
        }catch{/* Missing migration or network failure must not block reading or manufacture a warning. */}
    }
    return {notice,reportButton,refresh,reset,destroy(){reset();notice.remove();}};
}
