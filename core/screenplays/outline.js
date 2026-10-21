import {block,normalize,scenes,sceneDetails} from './model.js?v=2';

/** Move an entire scene. Introductory material stays before the first heading. */
export function moveScene(document,sourceId,targetId,{after=false}={}) {
    const list=scenes(document),from=list.findIndex(scene=>scene.id===sourceId),target=list.find(scene=>scene.id===targetId);
    if(from<0||!list[from].number||!target?.number||sourceId===targetId)return document;
    const [source]=list.splice(from,1);
    const to=list.findIndex(scene=>scene.id===targetId)+(after?1:0);
    list.splice(to,0,source);
    return {...document,blocks:list.flatMap(scene=>scene.blocks)};
}

export function updateScene(document,id,changes) {
    const index=document.blocks.findIndex(b=>b.id===id&&b.type==='scene');
    if(index<0)return document;
    const blocks=document.blocks.slice(),current=blocks[index];
    blocks[index]={...current,outline:sceneDetails({...current.outline,...changes})};
    // A heading change is a deliberate rewrite of the heading, not its body.
    if(Object.hasOwn(changes,'heading'))blocks[index].runs=[{text:String(changes.heading).slice(0,1000)}];
    return {...document,blocks};
}

export function addScene(document) {
    const heading={...block('scene'),outline:sceneDetails()};
    return {document:normalize({...document,blocks:[...document.blocks,heading,block('action')]}),id:heading.id};
}
