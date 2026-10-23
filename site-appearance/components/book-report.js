import {REPORT_REASONS,validateReport,reportError,statusLabel} from '/core/book-reports/model.js';
export function mountBookReport({button,book,service,onSubmitted=()=>{}}){
    if(!button)return {reset(){}};
    const dialog=document.createElement('dialog');dialog.className='br-dialog';dialog.setAttribute('aria-labelledby','br-title');
    dialog.innerHTML='<div class="br-dialog-frame"><header class="br-dialog-head"><h2 id="br-title">Report book</h2><button type="button" data-br-close aria-label="Close report">×</button></header><div class="br-scroll"><p data-br-book class="br-book-name"></p><section data-br-confirm><p>Are you sure you want to report this book?</p><p class="br-muted">Your report will be reviewed by staff. Reporting does not automatically remove a book.</p></section><section data-br-signin hidden><p>Sign in to submit a report.</p><a data-br-login>Sign in</a></section><form id="br-form" novalidate hidden><label for="br-reason">Reason for report *</label><select id="br-reason" required><option value="">Choose a reason</option></select><p id="br-reason-hint" class="br-muted"></p><label for="br-chapter">Chapter</label><select id="br-chapter"><option value="">Whole book</option></select><div data-br-tags hidden><label for="br-tags">Which tags or warnings are missing or incorrect? *</label><textarea id="br-tags" maxlength="1000" rows="3"></textarea></div><label for="br-explanation">What should staff know? *</label><textarea id="br-explanation" required minlength="10" maxlength="4000" rows="6" aria-describedby="br-detail-help"></textarea><p id="br-detail-help" class="br-muted">10–4,000 characters. Include the relevant passage or location where possible.</p><label for="br-link">Supporting link (optional)</label><input id="br-link" type="url" maxlength="2000" placeholder="https://"><p class="br-muted">Reports are private. Only authorized staff can see your identity and report details.</p></form><section data-br-existing hidden><h3>You already have an open report</h3><p data-br-existing-status></p><p>Add information for staff below. Your original report stays in the queue.</p><label for="br-followup">Additional information *</label><textarea id="br-followup" minlength="10" maxlength="4000" rows="6"></textarea></section><section data-br-success hidden><h3 data-br-success-title>Your report has been received.</h3><p>Staff will review it. Thank you for letting us know.</p></section><p data-br-error class="br-error" role="alert"></p><p data-br-status role="status" aria-live="polite"></p></div><footer class="br-dialog-actions"><button type="button" data-br-cancel>Cancel</button><button type="button" data-br-continue class="br-primary">Yes, continue</button><button type="submit" form="br-form" data-br-submit class="br-primary" hidden>Submit report</button><button type="button" data-br-update class="br-primary" hidden>Add information</button><button type="button" data-br-done hidden>Done</button></footer></div>';
    document.body.append(dialog);
    const $=s=>dialog.querySelector(s);let busy=false,epoch=0,openReport=null,requestId='',followId='',bodyOverflow='';
    $('[data-br-book]').textContent=(book.title||'Untitled')+' — '+(book.author||'Unknown');
    for(const item of REPORT_REASONS){const o=document.createElement('option');o.value=item.id;o.textContent=item.label;$('#br-reason').append(o);}
    for(const chapter of book.chapters||[]){const o=document.createElement('option');o.value=String(chapter.id);o.textContent=chapter.title||'Untitled chapter';$('#br-chapter').append(o);}
    $('[data-br-login]').href='/login?next='+encodeURIComponent('/book?id='+encodeURIComponent(book.id));
    const uuid=()=>crypto.randomUUID();
    function activity(value){busy=value;for(const b of dialog.querySelectorAll('button'))b.disabled=value;$('[data-br-status]').textContent=value?'Please wait…':'';}
    function view(name){
        for(const part of ['confirm','signin','existing','success'])$('[data-br-'+part+']').hidden=part!==name;
        $('#br-form').hidden=name!=='form';
        for(const [part,show]of [['continue',name==='confirm'],['submit',name==='form'],['update',name==='existing'],['done',name==='success'||name==='signin']])$('[data-br-'+part+']').hidden=!show;
        $('[data-br-cancel]').hidden=name==='success'||name==='signin';$('[data-br-error]').textContent='';
    }
    function showExisting(receipt){openReport=receipt;view('existing');$('[data-br-existing-status]').textContent='Status: '+statusLabel(receipt.status);$('#br-followup').focus();}
    function close(){if(busy)return;epoch++;dialog.close();document.body.style.overflow=bodyOverflow;button.focus();}
    function reset(){epoch++;activity(false);if(dialog.open){dialog.close();document.body.style.overflow=bodyOverflow;}$('#br-form').reset();$('#br-followup').value='';openReport=null;view('confirm');}
    button.addEventListener('click',()=>{reset();const theme=getComputedStyle(button);for(const name of ['--alysum-ui-panel','--alysum-ui-raised','--alysum-ui-chrome','--alysum-ui-input','--bg','--text','--ui-text','--muted','--border','--glass-radius','--font-display','--font-sans']){const value=theme.getPropertyValue(name);if(value)dialog.style.setProperty(name,value);}requestId=uuid();followId=uuid();bodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();$('[data-br-cancel]').focus();});
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    for(const selector of ['[data-br-close]','[data-br-cancel]','[data-br-done]'])$(selector).onclick=close;
    $('[data-br-continue]').onclick=async()=>{
        const version=epoch;activity(true);try{
            const session=await service.session();if(version!==epoch)return;
            if(!session){view('signin');return;}
            const existing=await service.own(book.id);if(version!==epoch)return;
            if(existing)showExisting(existing);else{view('form');$('#br-reason').focus();}
        }catch(error){if(version===epoch)$('[data-br-error]').textContent=reportError(error);}finally{if(version===epoch)activity(false);}
    };
    $('#br-reason').onchange=()=>{$('[data-br-tags]').hidden=$('#br-reason').value!=='improper_tags';$('#br-tags').required=$('#br-reason').value==='improper_tags';$('#br-reason-hint').textContent=$('#br-reason').value==='suspected_ai'?'Explain what raised your concern. Suspicion alone is not proof.':'';};
    $('#br-form').onsubmit=async e=>{
        e.preventDefault();if(busy)return;
        const value={reason:$('#br-reason').value,chapterId:$('#br-chapter').value,tagDetails:$('#br-reason').value==='improper_tags'?$('#br-tags').value:'',explanation:$('#br-explanation').value,supportingUrl:$('#br-link').value};
        const issue=validateReport(value,book.chapters||[]);if(issue){$('[data-br-error]').textContent=issue;return;}
        const version=epoch;activity(true);$('[data-br-error]').textContent='';
        try{const receipt=await service.submit(book,value,requestId);if(version!==epoch)return;if(receipt.existing){$('#br-followup').value=value.explanation;showExisting(receipt);}else{view('success');$('[data-br-success-title]').textContent='Your report has been received.';void Promise.resolve().then(onSubmitted).catch(()=>{});}}
        catch(error){if(version===epoch)$('[data-br-error]').textContent=reportError(error);}
        finally{if(version===epoch)activity(false);}
    };
    $('[data-br-update]').onclick=async()=>{
        if(busy||!openReport)return;const version=epoch;activity(true);$('[data-br-error]').textContent='';
        try{await service.followup(openReport.id,$('#br-followup').value,followId);if(version!==epoch)return;view('success');$('[data-br-success-title]').textContent='Your additional information has been received.';followId=uuid();}
        catch(error){if(version===epoch)$('[data-br-error]').textContent=reportError(error);}finally{if(version===epoch)activity(false);}
    };
    return {reset,destroy(){reset();dialog.remove();}};
}
