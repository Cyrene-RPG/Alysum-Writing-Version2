import {escape,scenes,textOf,SCENE_COLORS,SCENE_STATUSES} from '/core/screenplays/model.js?v=2';
import {moveScene,updateScene,addScene} from '/core/screenplays/outline.js';

export function mountSceneOutline({mount,getDocument,onChange,onWrite,onError}) {
    let mode='cards',filter='',act='',dragging=null;
    mount.innerHTML=`<header class="script-board-heading"><div><h2>Outline</h2><p>Plan the scene. Keep the script beside it.</p></div><button type="button" data-add-scene>Add scene</button></header>
      <div class="script-board-controls"><label>Find a scene<input type="search" data-board-search placeholder="Heading or summary…"></label><label>Act / sequence<select data-board-act><option value="">All acts</option></select></label>
      <div role="group" aria-label="Outline layout"><button type="button" data-board-mode="cards" aria-pressed="true">Cards</button><button type="button" data-board-mode="list" aria-pressed="false">List</button></div></div>
      <p data-board-status role="status" aria-live="polite"></p><div data-board-cards class="script-scene-cards"></div>`;
    const cards=mount.querySelector('[data-board-cards]'),status=mount.querySelector('[data-board-status]');
    function change(next,options={}){if(next===getDocument())return;onChange(next,options);}
    function render({force=false}={}) {
        if(!force&&cards.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select'))return;
        const documentValue=getDocument(),all=scenes(documentValue).filter(s=>s.number>0);
        const acts=[...new Set(all.map(s=>s.outline.act).filter(Boolean))];
        const select=mount.querySelector('[data-board-act]');
        if(!acts.includes(act))act='';
        select.innerHTML='<option value="">All acts</option>'+acts.map(value=>`<option value="${escape(value)}">${escape(value)}</option>`).join('');select.value=act;
        const visible=all.filter(scene=>(!act||scene.outline.act===act)&&(!filter||[scene.title,scene.outline.synopsis,scene.outline.act,scene.outline.status].join(' ').toLowerCase().includes(filter)));
        cards.dataset.layout=mode;
        status.textContent=all.length?(visible.length===all.length?`${all.length} scenes`:`${visible.length} of ${all.length} scenes`):'Add a scene to start your outline. Material before the first scene stays in the script.';
        cards.innerHTML=visible.map(scene=>{
            const characters=[...new Set(scene.blocks.filter(b=>b.type==='character').map(textOf).map(s=>s.toUpperCase()))];
            const words=scene.blocks.map(textOf).join(' ').trim().split(/\s+/).filter(Boolean).length;
            return `<article class="script-scene-card" data-card="${escape(scene.id)}" data-color="${scene.outline.color}">
              <header><span>Scene ${scene.number}</span><button type="button" class="script-drag-handle" draggable="true" data-drag-scene="${escape(scene.id)}" aria-label="Drag scene ${scene.number}. Use Position to reorder with a keyboard or on mobile." title="Drag to another scene">⠿</button></header>
              <label>Scene heading<input data-scene-field="heading" value="${escape(textOf(scene.blocks[0]))}" maxlength="1000" placeholder="INT. LOCATION — DAY"></label>
              <label>Summary<textarea data-scene-field="synopsis" maxlength="4000" placeholder="What changes in this scene?">${escape(scene.outline.synopsis)}</textarea></label>
              <div class="script-card-fields"><label>Act / sequence<input data-scene-field="act" maxlength="80" value="${escape(scene.outline.act)}" placeholder="Act I"></label><label>Status<select data-scene-field="status">${SCENE_STATUSES.map(value=>`<option value="${value}" ${scene.outline.status===value?'selected':''}>${value[0].toUpperCase()+value.slice(1)}</option>`).join('')}</select></label>
              <label>Card color<select data-scene-field="color">${SCENE_COLORS.map(value=>`<option value="${value}" ${scene.outline.color===value?'selected':''}>${value[0].toUpperCase()+value.slice(1)}</option>`).join('')}</select></label>
              <label>Position<select data-card-position>${all.map(s=>`<option value="${escape(s.id)}" ${s.id===scene.id?'selected':''}>${s.number}</option>`).join('')}</select></label></div>
              <p class="script-card-cast">${escape(characters.join(' · ')||'No character cues yet')}<span>${words.toLocaleString()} words</span></p>
              <footer><button type="button" data-card-write>Write scene</button><div><button type="button" data-card-step="-1" aria-label="Move scene ${scene.number} earlier" ${scene.number===1?'disabled':''}>↑</button><button type="button" data-card-step="1" aria-label="Move scene ${scene.number} later" ${scene.number===all.length?'disabled':''}>↓</button></div></footer>
            </article>`;
        }).join('');
    }
    function announce(message){status.textContent=message;}
    mount.addEventListener('input',event=>{
        const field=event.target.dataset.sceneField,id=event.target.closest('[data-card]')?.dataset.card;
        if(!id||!['heading','synopsis','act'].includes(field))return;
        try{change(updateScene(getDocument(),id,{[field]:event.target.value}),{typing:true,source:'outline'});}catch(error){onError(error.message);}
    });
    mount.addEventListener('change',event=>{
        const card=event.target.closest('[data-card]');if(!card)return;
        try {
            if(['status','color'].includes(event.target.dataset.sceneField)){change(updateScene(getDocument(),card.dataset.card,{[event.target.dataset.sceneField]:event.target.value}),{source:'outline'});card.dataset.color=getDocument().blocks.find(b=>b.id===card.dataset.card).outline.color;}
            if(event.target.matches('[data-card-position]')){const all=scenes(getDocument()).filter(s=>s.number),source=all.find(s=>s.id===card.dataset.card),target=all.find(s=>s.id===event.target.value);if(target&&source){change(moveScene(getDocument(),source.id,target.id,{after:source.number<target.number}),{source:'outline'});render({force:true});announce(`Scene moved to position ${target.number}.`);}}
        }catch(error){onError(error.message);}
    });
    mount.addEventListener('focusout',event=>{if(!event.target.matches('[data-scene-field]'))return;setTimeout(()=>{if(!cards.contains(document.activeElement))render();},0);});
    mount.querySelector('[data-board-search]').addEventListener('input',event=>{filter=event.target.value.trim().toLowerCase();render({force:true});});
    mount.querySelector('[data-board-act]').addEventListener('change',event=>{act=event.target.value;render({force:true});});
    mount.addEventListener('click',event=>{
        const button=event.target.closest('button');if(!button)return;
        try {
            if(button.dataset.boardMode){mode=button.dataset.boardMode;for(const b of mount.querySelectorAll('[data-board-mode]'))b.setAttribute('aria-pressed',String(b.dataset.boardMode===mode));render({force:true});return;}
            if(button.hasAttribute('data-add-scene')){const created=addScene(getDocument());filter='';act='';mount.querySelector('[data-board-search]').value='';change(created.document,{source:'outline'});render({force:true});[...cards.children].find(card=>card.dataset.card===created.id)?.querySelector('input').focus();return;}
            const card=button.closest('[data-card]');if(!card)return;
            if(button.hasAttribute('data-card-write')){onWrite(card.dataset.card);return;}
            if(button.dataset.cardStep){const all=scenes(getDocument()).filter(s=>s.number),index=all.findIndex(s=>s.id===card.dataset.card),step=Number(button.dataset.cardStep),target=all[index+step];if(!target)return;change(moveScene(getDocument(),card.dataset.card,target.id,{after:step>0}),{source:'outline'});render({force:true});const moved=[...cards.children].find(c=>c.dataset.card===card.dataset.card);moved?.querySelector('[data-card-write]').focus();announce(`Scene moved to position ${index+step+1}.`);}
        }catch(error){onError(error.message);}
    });
    mount.addEventListener('dragstart',event=>{const handle=event.target.closest('[data-drag-scene]');if(!handle)return;dragging=handle.dataset.dragScene;event.dataTransfer.setData('text/plain',dragging);event.dataTransfer.effectAllowed='move';});
    mount.addEventListener('dragover',event=>{if(dragging&&event.target.closest('[data-card]')){event.preventDefault();event.dataTransfer.dropEffect='move';}});
    mount.addEventListener('drop',event=>{const target=event.target.closest('[data-card]');if(!target||!dragging)return;event.preventDefault();try{const id=dragging;dragging=null;change(moveScene(getDocument(),id,target.dataset.card),{source:'outline'});render({force:true});announce('Scene order updated.');}catch(error){onError(error.message);}});
    mount.addEventListener('dragend',()=>{dragging=null;});
    return {render};
}
