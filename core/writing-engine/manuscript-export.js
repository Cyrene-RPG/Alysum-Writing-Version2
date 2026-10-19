/** Real Word manuscript export. Data in / DOCX object out; never edits the book. */
export const MANUSCRIPT_PRESETS = Object.freeze({
    classic: {label:'Shunn Classic',font:'Courier New'},
    times: {label:'Manuscript · Times New Roman',font:'Times New Roman'},
});
export function normalizeSubmissionDetails(value={}) {
    const out={};
    for(const key of ['byline','legalName','surname','shortTitle','address','email','phone']) {
        out[key]=String(value[key]||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,key==='address'?1000:200);
        if(key!=='address')out[key]=out[key].replace(/[\r\n]+/g,' ');
    }
    out.preset=Object.hasOwn(MANUSCRIPT_PRESETS,value.preset)?value.preset:'classic';
    out.paper=value.paper==='a4'?'a4':'letter';
    out.titlePage=value.titlePage!==false;
    out.includeMatter=value.includeMatter===true;
    return out;
}
export function manuscriptExportChapters(book,{includeMatter=false}={}) {
    const chapters=[];
    function walk(items,section) {
        for(const item of Array.isArray(items)?items:[]) {
            if(item?.kind==='folder'||Array.isArray(item?.children))walk(item.children,section);
            else if(item&&item.kind!=='note')chapters.push({id:String(item.id||''),title:String(item.title||'Untitled'),content:String(item.content||''),section});
        }
    }
    for(const key of includeMatter?['front','body','back']:['body'])walk(book?.sections?.[key],key);
    return chapters;
}
export function buildManuscriptExportModel(book, details, parseHtml) {
    if(typeof parseHtml!=='function')throw Error('A chapter text parser is required.');
    const options=normalizeSubmissionDetails(details);
    const chapters=manuscriptExportChapters(book,options).map(ch=>({...ch,blocks:parseHtml(ch.content)}));
    if(!chapters.length)throw Error('There are no chapters to export.');
    const text=chapters.flatMap(ch=>ch.blocks.filter(b=>b.kind!=='scene').map(b=>b.runs.map(r=>r.text).join(''))).join(' ');
    const wordCount=text.trim()?text.trim().split(/\s+/u).length:0;
    return {title:String(book?.title||'Untitled Book'),options,chapters,wordCount,approximateWords:wordCount<100?wordCount:Math.round(wordCount/100)*100};
}
export function manuscriptExportFilename(title) {
    return (String(title||'Manuscript').replace(/[<>:"/\\|?*\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,100)||'Manuscript')+'-manuscript.docx';
}
export function createManuscriptDocument(model,docx) {
    const {Document,Paragraph,TextRun,Header,Footer,PageNumber,AlignmentType,TabStopType,SectionType}=docx;
    const o=normalizeSubmissionDetails(model.options),font=MANUSCRIPT_PRESETS[o.preset].font;
    const run=(text,extra={})=>new TextRun({text:String(text),font,size:24,color:'000000',...extra});
    const para=(runs,extra={})=>new Paragraph({children:runs,alignment:AlignmentType.LEFT,indent:{firstLine:720},spacing:{before:0,after:0,line:480},...extra});
    const blankHeader=()=>new Header({children:[para([],{indent:{firstLine:0}})]});
    const blankFooter=()=>new Footer({children:[para([],{indent:{firstLine:0}})]});
    const margin={top:1440,bottom:1440,left:1440,right:1440,header:720,footer:720};
    const size=o.paper==='a4'?{width:11906,height:16838}:{width:12240,height:15840};
    const contentWidth=size.width-margin.left-margin.right;
    const titleParts=[];
    const count=`about ${model.approximateWords.toLocaleString('en-US')} words`;
    titleParts.push(para([run(o.legalName),run('\t'+count)],{indent:{firstLine:0},spacing:{before:0,after:0,line:240},tabStops:[{type:TabStopType.RIGHT,position:contentWidth}]}));
    for(const line of [o.address,o.phone,o.email].filter(Boolean).flatMap(v=>v.split(/\r?\n/)))titleParts.push(para([run(line)],{indent:{firstLine:0},spacing:{before:0,after:0,line:240}}));
    titleParts.push(para([run(model.title)],{alignment:AlignmentType.CENTER,indent:{firstLine:0},spacing:{before:2400,after:480,line:480},keepNext:true}));
    if(o.byline)titleParts.push(para([run('by '+o.byline)],{alignment:AlignmentType.CENTER,indent:{firstLine:0},spacing:{before:0,after:960,line:480},keepNext:!o.titlePage}));
    const headerParts=[o.surname,o.shortTitle||model.title].filter(Boolean);
    const header=new Header({children:[para([run(headerParts.length?headerParts.join(' / ')+' / ':''),new TextRun({children:[PageNumber.CURRENT],font,size:24,color:'000000'})],{alignment:AlignmentType.RIGHT,indent:{firstLine:0},spacing:{before:0,after:0,line:240}})]});
    const body=[];
    model.chapters.forEach((chapter,index)=>{
        // A single story can share its first page with its submission heading.
        const showHeading=o.titlePage||model.chapters.length>1;
        if(showHeading)body.push(para([run(chapter.title)],{pageBreakBefore:index>0,alignment:AlignmentType.CENTER,indent:{firstLine:0},spacing:{before:1440,after:480,line:480},keepNext:true}));
        chapter.blocks.forEach(block=>{
            if(block.kind==='scene')body.push(para([run('#')],{alignment:AlignmentType.CENTER,indent:{firstLine:0},keepNext:true}));
            else {
                const runs=[];
                for(const part of block.runs) {
                    String(part.text).split('\n').forEach((line,i)=>{if(i)runs.push(new TextRun({break:1,font,size:24}));if(line)runs.push(run(line,{italics:Boolean(part.italic)}));});
                }
                body.push(para(runs,block.quote?{indent:{firstLine:720,left:720,right:720}}:{}));
            }
        });
    });
    const sections=[];
    if(o.titlePage)sections.push({properties:{page:{size,margin}},headers:{default:blankHeader()},footers:{default:blankFooter()},children:titleParts});
    sections.push({properties:{type:SectionType.NEXT_PAGE,titlePage:!o.titlePage,page:{size,margin,pageNumbers:{start:1}}},headers:{default:header,...(!o.titlePage?{first:blankHeader()}: {})},footers:{default:blankFooter()},children:o.titlePage?body:[...titleParts,...body]});
    return new Document({
        title:model.title, creator:o.byline||'Alysum', description:'Manuscript export',
        styles:{default:{document:{
            run:{font,size:24,color:'000000'},
            paragraph:{spacing:{before:0,after:0,line:480},indent:{firstLine:720}}
        }}},
        sections
    });
}
