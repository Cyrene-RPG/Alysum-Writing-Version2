import { getBookReminder, saveBookReminder, defaultBookReminder } from '/core/publishing/reminders.js';

/** Mounted only by the Studio dashboard. */
export function mountStudioBookReminders({client,session,root=document}) {
    const form=root.getElementById('bookReminderForm'),dialog=root.getElementById('bookReminders');
    if(!form||!dialog||session.mode!=='cloud')return;
    const status=root.getElementById('bookReminderStatus'),fields=root.getElementById('bookReminderFields'),save=root.getElementById('saveBookReminder');
    const input=name=>form.elements.namedItem(name);
    let active=true,saving=false,bookId='',generation=0;
    function paint(settings) {
        for(const[name,value]of Object.entries(settings)){
            const element=input(name);if(!element)continue;
            if(element.type==='checkbox')element.checked=value;else element.value=value;
        }
        root.getElementById('bookReminderNext').textContent=settings.enabled&&settings.nextDue
            ? 'Next check: '+new Date(settings.nextDue).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})+' ('+settings.timezone+')':'';
    }
    const {data:subscription}=client.auth.onAuthStateChange((_event,next)=>{
        if((next?.user?.id||'')!==(session.user?.id||'')){
            active=false;generation++;bookId='';fields.disabled=true;save.disabled=true;form.reset();dialog.close();
        }
    });
    window.addEventListener('pagehide',()=>{active=false;subscription?.subscription?.unsubscribe();},{once:true});
    root.getElementById('closeBookReminders').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{generation++;bookId='';});
    async function open(book){
        if(!active)return;const request=++generation;bookId=String(book.id);saving=false;
        form.reset();paint(defaultBookReminder());fields.disabled=true;save.disabled=true;
        root.getElementById('bookReminderTitle').textContent=book.title||'Untitled';status.textContent='Loading reminder settings…';
        if(!dialog.open)dialog.showModal();
        try{
            const settings=await getBookReminder(client,bookId);if(!active||request!==generation)return;
            paint({...defaultBookReminder(),...settings});fields.disabled=false;save.disabled=false;status.textContent='';
        }catch(error){if(active&&request===generation)status.textContent=error.message;}
    }
    form.addEventListener('submit',async event=>{
        event.preventDefault();if(!active||saving||!bookId)return;const request=generation;
        saving=true;save.disabled=true;fields.disabled=true;status.textContent='Saving reminder…';
        const settings={enabled:input('enabled').checked,goal:input('goal').value,cadence:input('cadence').value,
            everyDays:input('everyDays').value,timezone:input('timezone').value.trim(),firstDueLocal:input('firstDueLocal').value,popupEnabled:input('popupEnabled').checked};
        try{
            const saved=await saveBookReminder(client,bookId,settings);if(!active||request!==generation)return;
            paint(saved);status.textContent=saved.enabled?'Reminder saved. We’ll only notify you if no qualifying update was made during the period.':'Reminders are off for this book.';
        }catch(error){if(active&&request===generation)status.textContent=error.message;}
        finally{if(active&&request===generation){saving=false;save.disabled=false;fields.disabled=false;}}
    });
    return {open};
}
