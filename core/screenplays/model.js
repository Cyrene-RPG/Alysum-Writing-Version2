export const ELEMENTS = Object.freeze({scene:'Scene heading',action:'Action',character:'Character',dialogue:'Dialogue',parenthetical:'Parenthetical',transition:'Transition',shot:'Shot'});
export const TYPES = Object.keys(ELEMENTS);
export const SCENE_COLORS = ['neutral','amber','blue','green','rose','violet'];
export const SCENE_STATUSES = ['planned','drafting','revised'];
export function sceneDetails(value={}) {
    return {synopsis:String(value?.synopsis??'').slice(0,4000),act:String(value?.act??'').slice(0,80),color:SCENE_COLORS.includes(value?.color)?value.color:'neutral',status:SCENE_STATUSES.includes(value?.status)?value.status:'planned'};
}
export const uid = () => globalThis.crypto.randomUUID();
export const textOf = block => block.runs.map(run=>run.text).join('');
export const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function runs(value) {
    const result=[];
    for(const item of Array.isArray(value)?value:[]) {
        const run={text:String(item?.text??'').replace(/\r/g,'').replace(/\u0000/g,'')};
        for(const mark of ['bold','italic','underline']) if(item?.[mark])run[mark]=true;
        if(!run.text)continue;
        const prev=result.at(-1);
        if(prev&&['bold','italic','underline'].every(mark=>!!prev[mark]===!!run[mark]))prev.text+=run.text;
        else result.push(run);
    }
    return result.length?result:[{text:''}];
}
export function block(type='action',text='') {return {id:uid(),type:TYPES.includes(type)?type:'action',runs:[{text}],dual:false};}
export function normalize(value={}) {
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('This is not a screenplay document.');
    if(value.version!=null&&value.version!==1)throw Error('This screenplay uses a newer document version. Update Alysum before opening it.');
    const seen=new Set();
    const blocks=(Array.isArray(value.blocks)&&value.blocks.length?value.blocks:[block('scene')]).map(item=>{
        const id=typeof item?.id==='string'&&item.id.length<=80&&!seen.has(item.id)?item.id:uid();seen.add(id);
        return {id,type:TYPES.includes(item?.type)?item.type:'action',runs:runs(item?.runs),dual:item?.type==='character'&&item.dual===true,...(item?.outline?{outline:sceneDetails(item.outline)}:{})};
    });
    if(blocks.length>20000)throw Error('This screenplay exceeds 20,000 elements. Split it into separate documents.');
    for(let i=0;i<blocks.length;i++)if(blocks[i].dual){let previous=i-1;while(previous>=0&&['dialogue','parenthetical'].includes(blocks[previous].type))previous--;if(previous<0||blocks[previous].type!=='character'||blocks[previous].dual)blocks[i].dual=false;}
    const doc={version:1,title:String(value.title||'Untitled screenplay').trim().slice(0,200)||'Untitled screenplay',author:String(value.author??'').slice(0,200),credit:String(value.credit??'Written by').slice(0,200),contact:String(value.contact??'').slice(0,2000),draft:String(value.draft??'').slice(0,200),paper:value.paper==='a4'?'a4':'letter',titlePage:value.titlePage!==false,blocks};
    if(JSON.stringify(doc).length>4000000)throw Error('This screenplay exceeds the 4 MB document limit. Export a backup before continuing.');
    return doc;
}
export function nextType(type,empty=false) {return empty?'action':({scene:'action',action:'action',character:'dialogue',dialogue:'character',parenthetical:'dialogue',transition:'scene',shot:'action'}[type]||'action');}
export function cycleType(type,back=false) {const order=['action','character','dialogue','parenthetical','transition','scene','shot'];return order[(order.indexOf(type)+(back?6:1))%order.length];}
export function scenes(doc) {
    const result=[];let scene;
    for(const item of doc.blocks) {
        if(item.type==='scene'){scene={id:item.id,title:textOf(item)||'Untitled scene',number:result.filter(s=>s.number>0).length+1,outline:sceneDetails(item.outline),blocks:[]};result.push(scene);}
        if(!scene){scene={id:item.id,title:'Before first scene',number:0,blocks:[]};result.push(scene);}
        scene.blocks.push(item);
    }
    return result;
}
export function reorderScene(doc,id,direction) {
    const list=scenes(doc),from=list.findIndex(scene=>scene.id===id),to=from+direction;
    if(from<0||to<0||to>=list.length||list[from].number===0||list[to].number===0)return doc;
    [list[from],list[to]]=[list[to],list[from]];
    return {...doc,blocks:list.flatMap(scene=>scene.blocks)};
}
export function sliceRuns(items,start=0,end=Infinity) {
    let offset=0;const out=[];
    for(const run of items){const a=Math.max(0,start-offset),b=Math.min(run.text.length,end-offset);if(b>a)out.push({...run,text:run.text.slice(a,b)});offset+=run.text.length;}
    return runs(out);
}
export function suggestions(doc,type,prefix) {
    if(!['scene','character'].includes(type)||!prefix.trim())return [];
    const term=prefix.toUpperCase();
    return [...new Set(doc.blocks.filter(b=>b.type===type).map(textOf))].filter(t=>t.toUpperCase().startsWith(term)&&t.toUpperCase()!==term).slice(0,6);
}
export function toFountain(doc) {
    const esc=text=>text.replace(/([*_\\])/g,'\\$1');
    const styled=b=>b.runs.map(r=>{let t=esc(r.text);if(r.underline)t='_'+t+'_';if(r.italic)t='*'+t+'*';if(r.bold)t='**'+t+'**';return t;}).join('');
    return ['Title: '+doc.title,'Credit: '+doc.credit,'Author: '+doc.author,'Draft date: '+doc.draft,'Contact: '+doc.contact.replace(/\n/g,'\n    '),'',...doc.blocks.map(b=>{
        let text=styled(b);
        if(b.type==='scene')text='.'+text.toUpperCase();
        if(b.type==='character')text='@'+text.toUpperCase()+(b.dual?' ^':'');
        if(b.type==='action')text='!'+text;
        if(b.type==='transition')text='>'+text.toUpperCase();
        if(b.type==='shot')text='!'+text.toUpperCase();
        if(b.type==='parenthetical'&&!text.startsWith('('))text='('+text+')';
        return text+(['dialogue','parenthetical','character'].includes(b.type)?'':'\n');
    })].join('\n')+'\n';
}
export function toFdx(doc) {
    const types={scene:'Scene Heading',action:'Action',character:'Character',dialogue:'Dialogue',parenthetical:'Parenthetical',transition:'Transition',shot:'Shot'};
    const p=b=>'<Paragraph Type="'+types[b.type]+'"'+(b.dual?' DualDialogue="Yes"':'')+'>'+b.runs.map(r=>'<Text'+(['bold','italic','underline'].some(k=>r[k])?' Style="'+['bold','italic','underline'].filter(k=>r[k]).map(k=>k[0].toUpperCase()+k.slice(1)).join('+')+'"':'')+'>'+escape(r.text)+'</Text>').join('')+'</Paragraph>';
    const content=[];
    for(let i=0;i<doc.blocks.length;i++) {
        const b=doc.blocks[i];
        if(b.type==='character') {
            let end=i+1;while(end<doc.blocks.length&&['dialogue','parenthetical'].includes(doc.blocks[end].type))end++;
            if(doc.blocks[end]?.type==='character'&&doc.blocks[end].dual){let e=end+1;while(e<doc.blocks.length&&['dialogue','parenthetical'].includes(doc.blocks[e].type))e++;content.push('<Paragraph><DualDialogue>'+doc.blocks.slice(i,e).map(p).join('')+'</DualDialogue></Paragraph>');i=e-1;continue;}
        }
        content.push(p(b));
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n<FinalDraft DocumentType="Script" Template="No" Version="1"><Content>'+content.join('')+'</Content><TitlePage><Content>'+[doc.title,doc.credit,doc.author,doc.draft,doc.contact].map(text=>'<Paragraph Type="Action"><Text>'+escape(text)+'</Text></Paragraph>').join('')+'</Content></TitlePage><PageLayout><PageSize Width="'+(doc.paper==='a4'?'8.2677':'8.5')+'" Height="'+(doc.paper==='a4'?'11.6929':'11')+'"/></PageLayout></FinalDraft>';
}
