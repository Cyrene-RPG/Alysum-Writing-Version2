/** An opt-in inbox reminder popup. The application supplies its account-scoped service. */
export function mountBookReminderPopup({service,root=document}) {
    if (!service.claimReminderPopup || root.getElementById('book-reminder-popup')) return;
    const link=root.createElement('link');link.rel='stylesheet';link.href='/site-appearance/css-styles/book-reminder-popup.css';root.head.append(link);
    const dialog=root.createElement('dialog');dialog.id='book-reminder-popup';dialog.className='book-reminder-popup';
    dialog.setAttribute('aria-labelledby','book-reminder-popup-title');dialog.setAttribute('aria-describedby','book-reminder-popup-message');
    dialog.innerHTML='<h2 id="book-reminder-popup-title"></h2><p id="book-reminder-popup-message"></p><p class="book-reminder-popup-error" role="status"></p><div class="book-reminder-popup-actions"><button type="button" data-reminder-dismiss autofocus>Dismiss</button><button type="button" data-reminder-open>Open book</button></div>';
    root.body.append(dialog);
    let account='',generation=0,busy=false,shown=false,entry=null;
    const title=dialog.querySelector('h2'),message=dialog.querySelector('#book-reminder-popup-message'),error=dialog.querySelector('[role="status"]');
    dialog.querySelector('[data-reminder-dismiss]').addEventListener('click',()=>dialog.close());
    dialog.querySelector('[data-reminder-open]').addEventListener('click',async event=>{
        if(!entry)return;const item=entry,request=generation;event.target.disabled=true;error.textContent='';
        try {
            const destination=await service.resolveDestination(item);
            await service.setRead(item.id,true);
            if(request!==generation)return;
            dialog.close();if(destination)window.location.assign(destination);
        }catch(reason){if(request===generation)error.textContent=reason.message||'Could not open this book. Try again.';}
        finally{event.target.disabled=false;}
    });
    async function check() {
        if(busy||shown||!account)return;busy=true;const request=generation;
        try {
            const next=await service.claimReminderPopup();
            if(request!==generation||!next)return;
            entry=next;shown=true;title.textContent=next.title;message.textContent=next.message;
            if(!root.querySelector('dialog[open]')){dialog.showModal();dialog.querySelector('[data-reminder-dismiss]').focus();}
            // If another dialog is open, the reminder remains in the inbox.
        }catch{/* The inbox remains usable before reminder setup, or during a connection failure. */}
        finally{if(request===generation)busy=false;}
    }
    return service.subscribe(state=>{
        if(account!==state.userId){account=state.userId;generation++;busy=false;shown=false;entry=null;dialog.close();title.textContent='';message.textContent='';error.textContent='';}
        if(state.ready&&!state.loading&&!state.error)void check();
    });
}
