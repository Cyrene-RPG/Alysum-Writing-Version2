import {AUDIO_ACCEPT,formatAudioDuration,audioError,inspectAudioFile} from '/core/audiobooks/model.js';
import {recordingDuration} from './audio-metadata.js';
import {loadAudiobookStyles} from './book-format-choice.js';

/** Mount author-only audio controls. Reference/player content is never an editor. */
export async function mountAudiobookEditor({mount,id,api,writtenBooks=[],focusUpload=false}) {
    loadAudiobookStyles();
    let book=await api.get(id),tracks=await api.tracks(id),busy=false,dirty=false;
    mount.classList.add('audio-workspace');
    mount.innerHTML=`<a href="/studio">← Back to Studio</a><h1 data-heading></h1><span class="audio-badge">Audiobook · Private draft</span>
      <p class="audio-muted">These recordings are private drafts. Uploading does not publish them or send notifications.</p>
      <section class="audio-panel"><h2>Details</h2><form data-details>
      <label>Title<input name="title" required maxlength="200"></label>
      <label>Description<textarea name="description" maxlength="6000"></textarea></label>
      <label>Audio edition of<select name="linked_book_id"><option value="">Standalone audiobook</option></select></label>
      <div class="audio-columns"><label>Narrator<input name="narrator" maxlength="200" autocomplete="off"></label><label>Recording credits<textarea name="credits" maxlength="2000" placeholder="Narration, production, and other credits"></textarea></label></div>
      <label class="audio-check"><input type="checkbox" name="rights_confirmed"><span>I have permission to upload and distribute these recordings, including the narration or commissioned performance.</span></label>
      <button type="submit" class="audio-primary">Save details</button><p data-details-status role="status"></p></form></section>
      <section class="audio-panel" id="audio-upload"><h2>Add a recording</h2><p class="audio-muted">Upload a chapter or a complete recording. MP3, M4A, OGG, WAV, or WebM; up to 50 MB per file. Recordings are listed in upload order.</p>
      <form data-upload><label>Recording title<input name="track_title" required maxlength="200" placeholder="Chapter 1"></label>
      <label>Audio file<input name="recording" type="file" accept="${AUDIO_ACCEPT}" required></label>
      <button type="submit" class="audio-primary">Upload recording</button><p data-upload-status role="status"></p></form></section>
      <section class="audio-panel"><h2>Recordings</h2><div data-tracks></div><p data-track-status role="status"></p></section>`;
    const form=mount.querySelector('[data-details]'),upload=mount.querySelector('[data-upload]');
    const field=name=>form.elements.namedItem(name);
    const select=field('linked_book_id');
    const options=new Map(writtenBooks.map(row=>[String(row.id),row.title]));
    if(book.linked_book_id&&!options.has(String(book.linked_book_id)))options.set(String(book.linked_book_id),'Linked written book');
    for(const [value,text] of options){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
    for(const key of ['title','description','linked_book_id','narrator','credits'])field(key).value=book[key] || '';
    field('rights_confirmed').checked=book.rights_confirmed;
    mount.querySelector('[data-heading]').textContent=book.title;
    const show=(target,value)=>{mount.querySelector(`[data-${target}-status]`).textContent=value;};
    function lock(value){busy=value;for(const control of mount.querySelectorAll('button,input,select,textarea'))control.disabled=value;}
    function renderTracks(){
        const list=mount.querySelector('[data-tracks]');
        for(const audio of list.querySelectorAll('audio')){audio.pause();audio.removeAttribute('src');audio.load();}
        list.replaceChildren();
        if(!tracks.length){const empty=document.createElement('p');empty.className='audio-muted';empty.textContent='No recordings uploaded yet.';list.append(empty);return;}
        for(const track of tracks){
            const row=document.createElement('article');row.className='audio-track';
            const heading=document.createElement('h3');heading.textContent=track.title;
            const detail=document.createElement('p');detail.className='audio-muted';detail.textContent=`${formatAudioDuration(track.duration_seconds)} · ${(track.size_bytes/1024/1024).toFixed(1)} MB`;
            const actions=document.createElement('div');actions.className='audio-track-actions';
            const preview=document.createElement('button');preview.type='button';preview.textContent='Preview recording';
            const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';
            actions.append(preview,remove);row.append(heading,detail,actions);list.append(row);
            preview.addEventListener('click',async()=>{
                if(busy)return;preview.disabled=true;show('track','Opening recording…');
                try{
                    let player=row.querySelector('audio');
                    if(!player){player=document.createElement('audio');player.controls=true;player.preload='none';row.append(player);}
                    player.src=await api.preview(track);
                    player.onerror=()=>show('track','Could not play this recording. Press Preview recording to get a fresh playback link.');
                    player.scrollIntoView({block:'nearest'});show('track','Use the player to listen. This playback link is private and temporary.');
                }catch(error){show('track',audioError(error).message);}
                finally{preview.disabled=false;}
            });
            remove.addEventListener('click',async()=>{
                if(busy||!window.confirm(`Remove “${track.title}” from this audiobook? This cannot be undone.`))return;
                lock(true);show('track','Removing recording…');
                try{
                    const result=await api.removeTrack(track.id);tracks=tracks.filter(item=>item.id!==track.id);renderTracks();
                    book=await api.get(id);show('track',result.cleanupFailed?'Recording removed. Storage cleanup needs attention from the site owner.':'Recording removed.');
                }catch(error){show('track',audioError(error).message);}
                finally{lock(false);}
            });
        }
    }
    form.addEventListener('input',()=>{dirty=true;show('details','Unsaved changes');});
    form.addEventListener('submit',async event=>{
        event.preventDefault();if(busy)return;
        const values=Object.fromEntries(new FormData(form));values.rights_confirmed=field('rights_confirmed').checked;
        lock(true);show('details','Saving…');
        try{book=await api.save(id,values);dirty=false;mount.querySelector('[data-heading]').textContent=book.title;show('details','Details saved.');}
        catch(error){show('details',audioError(error).message);}
        finally{lock(false);}
    });
    upload.elements.namedItem('recording').addEventListener('change',()=>{
        const file=upload.elements.namedItem('recording').files[0];
        if(file&&!upload.elements.namedItem('track_title').value)upload.elements.namedItem('track_title').value=file.name.replace(/\.[^.]+$/,'').slice(0,200);
    });
    upload.addEventListener('submit',async event=>{
        event.preventDefault();if(busy)return;
        if(dirty){show('upload','Save your details before uploading a recording.');return;}
        if(!book.rights_confirmed){show('upload','Confirm your permission to share these recordings and save the details first.');field('rights_confirmed').focus();return;}
        const file=upload.elements.namedItem('recording').files[0],title=upload.elements.namedItem('track_title').value;
        lock(true);show('upload','Checking recording…');
        try{
            await inspectAudioFile(file);const duration=await recordingDuration(file);
            show('upload','Uploading recording… Keep this page open until it finishes.');
            const track=await api.upload(id,file,{title,duration});tracks.push(track);renderTracks();upload.reset();
            book=await api.get(id);show('upload','Recording uploaded. It remains private.');
        }catch(error){show('upload',audioError(error).message);}
        finally{lock(false);}
    });
    window.addEventListener('beforeunload',event=>{if(busy||dirty){event.preventDefault();event.returnValue='';}});
    renderTracks();
    if(focusUpload){mount.querySelector('#audio-upload').scrollIntoView({block:'start'});upload.elements.namedItem('recording').focus();}
    return {getBook:()=>book};
}
