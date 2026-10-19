/** Extract text and italics from an inert HTML document. No source DOM mutation. */
const BLOCKS=new Set(['P','DIV','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE','UL','OL','SECTION','ARTICLE','PRE','TR']);
const OMIT=new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG','CANVAS','IMG','IFRAME','OBJECT','VIDEO','AUDIO']);
export function parseManuscriptHtml(html) {
    const root=new DOMParser().parseFromString(String(html||''),'text/html').body;
    const blocks=[];let runs=[];let quote=false;
    function flush(){
        while(runs.length&&!runs[0].text.trim())runs.shift();
        while(runs.length&&!runs.at(-1).text.trim())runs.pop();
        if(runs.length){runs[0].text=runs[0].text.replace(/^\s+/u,'');runs.at(-1).text=runs.at(-1).text.replace(/\s+$/u,'');blocks.push({kind:'paragraph',runs,quote});}
        runs=[];
    }
    function append(text,italic) {
        const value=text.replace(/[\u200b\ufeff]/g,'').replace(/\u00a0/g,' ').replace(/[\t\r\n ]+/g,' ');
        if(!value)return;
        const last=runs.at(-1);
        if(last&&last.italic===italic)last.text+=value;
        else runs.push({text:value,italic});
    }
    function walk(node,italic=false,inQuote=false) {
        if(node.nodeType===3){append(node.textContent,italic);return;}
        if(node.nodeType!==1||OMIT.has(node.tagName)||node.hidden)return;
        if(node.classList.contains('scene-break')||node.classList.contains('scene-spacer')||node.classList.contains('scene-rule')||node.tagName==='HR') {
            flush();blocks.push({kind:'scene',runs:[{text:'#',italic:false}]});return;
        }
        if(node.tagName==='BR'){runs.push({text:'\n',italic});return;}
        const isBlock=BLOCKS.has(node.tagName);
        if(isBlock)flush();
        const oldQuote=quote;quote=inQuote||node.tagName==='BLOCKQUOTE';
        const nextItalic=italic||['I','EM'].includes(node.tagName)||/^(italic|oblique)/.test(node.style.fontStyle);
        for(const child of node.childNodes)walk(child,nextItalic,quote);
        if(isBlock)flush();
        quote=oldQuote;
    }
    for(const node of root.childNodes)walk(node);
    flush();return blocks;
}
