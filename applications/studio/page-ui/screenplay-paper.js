import {paginate} from '/core/screenplays/pagination.js';
export function styledText(parent,items) {
    for(const run of items){let node=document.createTextNode(run.text);for(const key of ['bold','italic','underline'])if(run[key]){const el=document.createElement({bold:'strong',italic:'em',underline:'u'}[key]);el.append(node);node=el;}parent.append(node);}
}
export function measureCourier() {
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font='12px "Courier New", Courier, monospace';
    return text=>ctx.measureText(text).width;
}
export function renderPaper(mount,doc,{numbers=false}={}) {
    const layout=paginate(doc,measureCourier());mount.replaceChildren();
    mount.style.setProperty('--script-width',layout.paper.width+'pt');mount.style.setProperty('--script-height',layout.paper.height+'pt');
    function sheet(){const article=document.createElement('article');article.className='script-sheet';mount.append(article);return article;}
    if(doc.titlePage){const article=sheet();article.setAttribute('aria-label','Title page');const title=document.createElement('div');title.className='script-title-page';for(const value of [doc.title.toUpperCase(),' ',doc.credit,doc.author,' ',doc.draft]){const line=document.createElement('p');line.textContent=value||' ';title.append(line);}article.append(title);const contact=document.createElement('div');contact.className='script-contact';contact.textContent=doc.contact;article.append(contact);}
    layout.pages.forEach((lines,index)=>{
        const article=sheet();article.setAttribute('aria-label','Screenplay page '+(index+1));
        if(index>0){const page=document.createElement('span');page.className='script-page-number';page.textContent=(index+1)+'.';article.append(page);}
        for(const line of lines){const el=document.createElement('div');el.className='script-paper-line';Object.assign(el.style,{left:line.x+'pt',top:line.y+'pt',width:line.width+'pt',textAlign:line.align||'left'});styledText(el,line.runs);article.append(el);if(numbers&&line.scene&&lines.find(l=>l.id===line.id)===line){const n=document.createElement('span');n.className='script-scene-number';n.style.top=line.y+'pt';n.textContent=line.scene;article.append(n);}}
    });
    return layout;
}
export function printScript(doc,options) {
    document.querySelector('#scriptPrint')?.remove();
    const root=document.createElement('div');root.id='scriptPrint';root.className='script-paper';document.body.append(root);renderPaper(root,doc,options);
    const style=document.createElement('style');style.textContent='@page{size:'+(doc.paper==='a4'?'A4':'letter')+';margin:0}';document.head.append(style);
    const cleanup=()=>{root.remove();style.remove();};window.addEventListener('afterprint',cleanup,{once:true});
    window.print();
}
