const escape = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function loadAudiobookStyles() {
    if (document.querySelector('link[data-audiobook-styles]')) return;
    const link=document.createElement('link');link.rel='stylesheet';link.href='/css/studio/audiobooks.css?v=2';link.dataset.audiobookStyles='';document.head.append(link);
}

/** Shared entry point for New book and Upload book. Written-book behavior is delegated. */
export function mountBookFormatChoice({session,getBooks,createWritten,importWritten,createAudio,createScript,navigate=url=>window.location.assign(url)}) {
    loadAudiobookStyles();
    const dialog=document.createElement('dialog');dialog.className='audio-dialog';dialog.setAttribute('aria-labelledby','format-title');
    document.body.append(dialog);
    let entry='new',trigger,busy=false;
    const header=title=>`<header><h2 id="format-title">${title}</h2><button type="button" data-close aria-label="Close">×</button></header>`;
    function message(error){const node=dialog.querySelector('[data-error]');node.textContent=error?.message || String(error);node.hidden=false;}
    function choose() {
        dialog.innerHTML=header(entry==='upload'?'What would you like to upload?':'What would you like to create?')+`
          <p class="audio-muted">Choose a format to get started.</p><div class="audio-format-options">
          <button type="button" data-format="written"><strong>Written book</strong><span>${entry==='upload'?'Upload a manuscript':'Start with a blank book'}</span></button>
          <button type="button" data-format="script"><strong>Script</strong><span>${entry==='upload'?'Import an FDX, Fountain or Alysum screenplay':'Write a film or television screenplay'}</span></button>
          <button type="button" data-format="epub"><strong>EPUB book</strong><span>Upload a complete EPUB · One whole-book price</span></button>
          <button type="button" data-format="audio"><strong>Audiobook</strong><span>${entry==='upload'?'Set up an audiobook and upload recordings':'Create an audiobook and add recordings when ready'}</span></button></div>
          <p class="audio-error" data-error role="alert" hidden></p>`;
    }
    function audioSetup() {
        const books=getBooks().filter(book=>String(book.user_id)===String(session.user?.id) && !book.draft_parent_id);
        dialog.innerHTML=header('Set up your audiobook')+`<form data-audio-setup>
          <p class="audio-muted">Create a private draft. You can add your recordings and narrator credits next.</p>
          <label>Title<input name="title" required maxlength="200" autocomplete="off"></label>
          <label>Audio edition of<select name="linked_book_id"><option value="">Standalone audiobook</option>${books.map(book=>`<option value="${escape(book.id)}">${escape(book.title)}</option>`).join('')}</select></label>
          <p class="audio-muted">Link one of your written books, or keep this audiobook separate. You can change this later.</p>
          <p class="audio-error" data-error role="alert" hidden></p>
          <footer><button type="button" data-back>Back</button><button type="submit" class="audio-primary">${entry==='upload'?'Continue to recordings':'Create audiobook'}</button></footer></form>`;
        dialog.querySelector('input').focus();
    }
    dialog.addEventListener('click',async event=>{
        if(busy)return;
        if(event.target.closest('[data-close]')){dialog.close();return;}
        if(event.target.closest('[data-back]')){choose();return;}
        const format=event.target.closest('[data-format]')?.dataset.format;
        if(!format)return;
        if(format==='epub'){if(session.mode!=='cloud'){message('Sign in online to upload and publish EPUB books.');return;}dialog.close();navigate('/applications/studio/pages/epub-publish.html');return;}
        if(format==='script'){
            busy=true;for(const button of dialog.querySelectorAll('button'))button.disabled=true;
            try{const created=await createScript({title:'Untitled screenplay'});dialog.close();navigate(`/screenplay-studio?id=${encodeURIComponent(created.id)}${entry==='upload'?'&import=1':''}`);}
            catch(error){message(error);}
            finally{busy=false;for(const button of dialog.querySelectorAll('button'))button.disabled=false;}
            return;
        }
        if(format==='audio'){
            if(session.mode!=='cloud'){message('Sign in online to create and upload audiobooks. Written books still work on this device.');return;}
            audioSetup();return;
        }
        if(entry==='upload'){trigger=null;dialog.close();importWritten();return;}
        busy=true;for(const button of dialog.querySelectorAll('button'))button.disabled=true;
        try{const created=await createWritten();dialog.close();navigate(`/editor?book=${encodeURIComponent(created.id)}`);}
        catch(error){message(error);}
        finally{busy=false;for(const button of dialog.querySelectorAll('button'))button.disabled=false;}
    });
    dialog.addEventListener('submit',async event=>{
        event.preventDefault();if(busy)return;const values=new FormData(event.target);
        busy=true;for(const control of dialog.querySelectorAll('button,input,select'))control.disabled=true;
        try{
            const created=await createAudio({title:values.get('title'),linked_book_id:values.get('linked_book_id')});
            dialog.close();navigate(`/audiobook-studio?id=${encodeURIComponent(created.id)}${entry==='upload'?'&upload=1':''}`);
        }catch(error){message(error);}
        finally{busy=false;for(const control of dialog.querySelectorAll('button,input,select'))control.disabled=false;}
    });
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('close',()=>trigger?.focus());
    return {open(mode='new',button,audio=false){if(dialog.open)return;entry=mode;trigger=button;choose();dialog.showModal();if(audio&&session.mode==='cloud')audioSetup();}};
}

