import {loadAudiobookStyles} from './book-format-choice.js';

export function mountAudiobookShelf({api,session,before,onCreate}) {
    loadAudiobookStyles();
    const section=document.createElement('section');section.className='audio-shelf';section.setAttribute('aria-labelledby','audio-shelf-title');
    section.innerHTML='<div class="audio-section-head"><h2 id="audio-shelf-title">Your audiobooks</h2><button type="button" data-new>New audiobook</button></div><p class="audio-muted">Private drafts and recordings.</p><div class="audio-shelf-list"></div><p class="audio-muted" data-status role="status"></p><button type="button" data-retry hidden>Retry audiobooks</button>';
    before.before(section);
    section.querySelector('[data-new]').addEventListener('click',event=>onCreate(event.currentTarget));
    let generation=0;
    async function refresh(){
        const request=++generation,status=section.querySelector('[data-status]'),retry=section.querySelector('[data-retry]');retry.hidden=true;
        if(session.mode!=='cloud'){status.textContent='Sign in online to create and upload audiobooks.';return;}
        status.textContent='Loading audiobooks…';
        try{
            const books=await api.list();if(request!==generation)return;
            const list=section.querySelector('.audio-shelf-list');list.replaceChildren();
            for(const book of books){
                const link=document.createElement('a');link.className='audio-shelf-card';link.href=`/audiobook-studio?id=${encodeURIComponent(book.id)}`;
                const title=document.createElement('h3');title.textContent=book.title;
                const label=document.createElement('span');label.className='audio-muted';label.textContent='Audiobook · Private draft';
                link.append(title,label);list.append(link);
            }
            status.textContent=books.length?'':'No audiobooks yet. Start one when you’re ready.';
        }catch(error){if(request!==generation)return;status.textContent=error.message || 'Could not load audiobooks.';retry.hidden=false;}
    }
    section.querySelector('[data-retry]').addEventListener('click',()=>void refresh());void refresh();
    return {refresh};
}
