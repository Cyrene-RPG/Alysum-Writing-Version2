import {normalize,block,runs} from '/core/screenplays/model.js?v=2';
function inline(text) {
    const result=[];let marks={},buffer='';const flush=()=>{if(buffer)result.push({text:buffer,...marks});buffer='';};
    for(let i=0;i<text.length;){if(text[i]==='\\'&&i+1<text.length){buffer+=text[i+1];i+=2;continue;}let token=text.startsWith('**',i)?'**':['*','_'].includes(text[i])?text[i]:'';if(token){flush();const key={'**':'bold','*':'italic','_':'underline'}[token];marks={...marks,[key]:!marks[key]};i+=token.length;}else buffer+=text[i++];}flush();return runs(result);
}
export function parseFountain(source) {
    const lines=source.replace(/\r/g,'').split('\n'),doc={blocks:[]};let i=0,dialogue=false;
    while(i<lines.length&&/^(Title|Credit|Author|Authors|Draft date|Contact):/i.test(lines[i])){const match=lines[i++].match(/^([^:]+):\s*(.*)$/);const key={title:'title',credit:'credit',author:'author',authors:'author','draft date':'draft',contact:'contact'}[match[1].toLowerCase()];let value=match[2];while(/^ {3,}\S/.test(lines[i]||''))value+='\n'+lines[i++].trim();doc[key]=value;}
    for(;i<lines.length;i++) {
        let line=lines[i];if(!line.trim()){dialogue=false;continue;}
        if(/^\s*(?:\/\*|\[\[|#|=)/.test(line))throw Error('This Fountain file contains notes, sections or comments. Import an FDX or Alysum backup to preserve them; this importer will not silently discard them.');
        let type='action',dual=false;
        if(/^\.(?!\.)/.test(line)){type='scene';line=line.slice(1);}
        else if(/^(INT\.?|EXT\.?|INT\.\/EXT\.?|I\/E\.?)\s/i.test(line))type='scene';
        else if(line.startsWith('@')){type='character';line=line.slice(1);}
        else if(line.startsWith('!'))line=line.slice(1);
        else if(line.startsWith('>')&&!line.endsWith('<')){type='transition';line=line.slice(1).trim();}
        else if(/^\([^\n]*\)$/.test(line)&&dialogue)type='parenthetical';
        else if(dialogue)type='dialogue';
        else if(/^[A-Z][A-Z0-9 .’'()\-]+(?:\s\^)?$/.test(line)&&lines[i+1]?.trim())type='character';
        if(type==='character'){dual=/\s\^\s*$/.test(line);line=line.replace(/\s\^\s*$/,'');dialogue=true;}
        const previous=doc.blocks.at(-1);
        if(type==='action'&&previous?.type==='action'&&i>0&&lines[i-1].trim()&&!lines[i].startsWith('!'))previous.runs=runs([...previous.runs,{text:'\n'},...inline(line)]);
        else doc.blocks.push({...block(type),runs:inline(line),dual});
    }
    return {document:normalize(doc),warnings:['Fountain import supports screenplay elements and bold, italic and underline. Check page breaks and title details before delivery.']};
}
export function parseFdx(source) {
    if(/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('This XML file contains unsupported declarations. Export a plain FDX file.');
    const xml=new DOMParser().parseFromString(source,'application/xml');
    if(xml.querySelector('parsererror')||xml.documentElement.tagName!=='FinalDraft')throw Error('This is not a valid Final Draft XML (.fdx) file.');
    const content=xml.documentElement.querySelector(':scope > Content');if(!content)throw Error('This FDX file has no screenplay content.');
    const types={'Scene Heading':'scene',Action:'action',Character:'character',Dialogue:'dialogue',Parenthetical:'parenthetical',Transition:'transition',Shot:'shot'};
    const blocks=[],warnings=new Set();
    for(const node of content.querySelectorAll('Paragraph')) {
        if(node.querySelector(':scope > DualDialogue'))continue;
        let type=types[node.getAttribute('Type')];if(!type){type='action';warnings.add('Unsupported paragraph types were retained as action.');}
        const items=[...node.children].filter(n=>n.tagName==='Text').map(n=>{const style=(n.getAttribute('Style')||'').toLowerCase().split('+');return {text:n.textContent,bold:style.includes('bold'),italic:style.includes('italic'),underline:style.includes('underline')};});
        let dual=false;if(type==='character'){const group=node.closest('DualDialogue');dual=!!group&&[...group.querySelectorAll('Paragraph[Type="Character"]')].indexOf(node)>0;}
        blocks.push({...block(type),runs:runs(items),dual:dual||node.getAttribute('DualDialogue')==='Yes'});
    }
    const title=[...xml.querySelectorAll('TitlePage > Content > Paragraph')].map(n=>[...n.querySelectorAll('Text')].map(t=>t.textContent).join(''));
    const pageSize=xml.querySelector('PageLayout PageSize');
    if(xml.querySelector('ScriptNote,Image,RevisionSets,HeaderAndFooter,SceneProperties,Text[RevisionID]'))warnings.add('This draft imports text, emphasis and dual dialogue. Production revisions, notes, images and custom headers are not imported. Keep your original FDX.');
    return {document:normalize({title:title[0],credit:title[1],author:title[2],draft:title[3],contact:title.slice(4).join('\n'),paper:Math.abs(Number(pageSize?.getAttribute('Height'))-11.6929)<0.1?'a4':'letter',blocks}),warnings:[...warnings,'FDX exchange supports drafting elements, emphasis and dual dialogue. Verify the exported file in Final Draft before production delivery.']};
}
export async function readScreenplay(file) {
    if(file.size>5000000)throw Error('Choose a screenplay file smaller than 5 MB.');
    const source=await file.text(),ext=file.name.toLowerCase().split('.').pop();
    if(ext==='fdx')return parseFdx(source);
    if(ext==='fountain'||ext==='txt')return parseFountain(source);
    if(ext==='json'){let value;try{value=JSON.parse(source);}catch{throw Error('The backup is not valid JSON.');}return {document:normalize(value),warnings:[]};}
    throw Error('Choose an Alysum .json backup, .fdx screenplay or .fountain text file.');
}
export function downloadScript(doc,content,extension,mime='text/plain') {
    const link=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type:mime+';charset=utf-8'}));
    link.href=url;link.download=(doc.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'').slice(0,100)||'screenplay')+'.'+extension;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
