import {textOf,sliceRuns} from './model.js';
export const PAPER = {letter:{width:612,height:792},a4:{width:595.276,height:841.89}};
export const LINE_HEIGHT=12;
// Points, measured from the left edge of the sheet. The body uses 12pt Courier.
function geometry(type,width,dual=false) {
    if(dual)return type==='character'?{x:36,width:width-36}:type==='parenthetical'?{x:18,width:width-36}:{x:0,width};
    if(type==='character')return {x:158.4,width:width-158.4};
    if(type==='dialogue')return {x:72,width:252};
    if(type==='parenthetical')return {x:115.2,width:208.8};
    return {x:0,width};
}
export function wrapRuns(runs,width,measure=text=>Array.from(text).length*7.2) {
    const text=runs.map(r=>r.text).join('');
    if(!text)return [[{text:''}]];
    const segments=Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text));
    const lines=[];let start=0,index=0,lastSpace=-1;
    while(index<segments.length) {
        const part=segments[index],end=part.index+part.segment.length;
        if(part.segment==='\n'){lines.push(sliceRuns(runs,start,part.index));start=end;index++;lastSpace=-1;continue;}
        if(measure(text.slice(start,end))>width&&part.index>start) {
            const stop=lastSpace>=start?lastSpace:part.index;
            lines.push(sliceRuns(runs,start,stop));start=stop;
            while(start<text.length&&/[ \t]/.test(text[start]))start++;
            index=segments.findIndex(p=>p.index>=start);if(index<0)break;lastSpace=-1;continue;
        }
        if(/[ \t]/.test(part.segment))lastSpace=part.index;
        index++;
    }
    if(start<text.length||text.endsWith('\n'))lines.push(sliceRuns(runs,start));
    return lines.length?lines:[[{text:''}]];
}
/** One immutable layout is shared by page preview and print/PDF output. */
export function paginate(doc,measure) {
    const paper=PAPER[doc.paper]||PAPER.letter,bodyWidth=paper.width-180;
    const capacity=Math.floor((paper.height-144)/LINE_HEIGHT),pages=[[]];
    let row=0,scene=0;
    const current=()=>pages.at(-1);
    const newPage=()=>{if(current().length)pages.push([]);row=0;};
    const put=lines=>{for(const line of lines)current().push({...line,y:72+row*LINE_HEIGHT});row++;};
    const makeRows=(b,width=bodyWidth,dual=false,offset=0)=>{
        const g=geometry(b.type,width,dual);
        const items=['scene','character','transition','shot'].includes(b.type)?b.runs.map(r=>({...r,text:r.text.toUpperCase()})):b.runs;
        return wrapRuns(items,g.width,measure).map(runs=>[{id:b.id,type:b.type,runs,x:108+offset+g.x,width:g.width,align:b.type==='transition'?'right':'left',scene:b.type==='scene'?scene:null}]);
    };
    const cueRows=(name,x=108+158.4,width=bodyWidth-158.4)=>[[{type:'character',runs:[{text:name.replace(/\s*\(CONT['’]D\)\s*$/i,'')+" (CONT’D)"}],x,width,continuation:true}]];
    const more=(dual=false)=>dual?[{type:'parenthetical',runs:[{text:'(MORE)'}],x:126,width:180},{type:'parenthetical',runs:[{text:'(MORE)'}],x:126+(bodyWidth+18)/2,width:180}]:[{type:'parenthetical',runs:[{text:'(MORE)'}],x:223.2,width:208.8}];
    const dialogueGroup=start=>{let end=start+1;while(end<doc.blocks.length&&['dialogue','parenthetical'].includes(doc.blocks[end].type))end++;return end;};
    for(let i=0;i<doc.blocks.length;i++) {
        const b=doc.blocks[i];if(b.type==='scene')scene++;
        let rows,dialogue=false,dual=false,names=[];
        if(b.type==='character') {
            let end=dialogueGroup(i);dialogue=true;names=[textOf(b)];
            if(doc.blocks[end]?.type==='character'&&doc.blocks[end].dual) {
                dual=true;const second=end;end=dialogueGroup(second);names.push(textOf(doc.blocks[second]));
                const col=(bodyWidth-18)/2;
                const left=doc.blocks.slice(i,second).flatMap(item=>makeRows(item,col,true));
                const right=doc.blocks.slice(second,end).flatMap(item=>makeRows(item,col,true,col+18));
                rows=Array.from({length:Math.max(left.length,right.length)},(_,j)=>[...(left[j]||[]),...(right[j]||[])]);
            }else rows=doc.blocks.slice(i,end).flatMap(item=>makeRows(item));
            i=end-1;
        }else rows=makeRows(b);
        const gap=row>0?1:0;
        let minimum=Math.min(rows.length,dialogue?3:2);
        if(['scene','shot'].includes(b.type)&&i+1<doc.blocks.length)minimum=rows.length+1+(doc.blocks[i+1].type==='character'?3:Math.min(2,makeRows(doc.blocks[i+1]).length));
        if(row+gap+minimum>capacity)newPage();
        if(row>0)row++;
        let pos=0;
        while(pos<rows.length) {
            let room=capacity-row,remaining=rows.length-pos;
            if(remaining<=room){for(const line of rows.slice(pos))put(line);break;}
            // Keep at least two text lines together; reserve a continuation marker.
            const take=Math.max(0,room-(dialogue?1:0));
            if(take<2){newPage();continue;}
            let count=take;
            if(!dialogue&&remaining-count===1)count--;
            for(const line of rows.slice(pos,pos+count))put(line);
            pos+=count;
            if(dialogue)put(more(dual));
            newPage();
            if(dialogue) {
                if(dual){const col=(bodyWidth-18)/2;put([...cueRows(names[0],144,col-36)[0],...cueRows(names[1],144+col+18,col-36)[0]]);}
                else put(cueRows(names[0])[0]);
            }
        }
    }
    return {paper,pages,capacity,lineHeight:LINE_HEIGHT};
}
