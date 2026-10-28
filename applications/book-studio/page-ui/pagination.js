import { THEMES } from '/core/book-studio/model.js';
let generation = 0;
function element(tag, className, text) { const node = document.createElement(tag); node.className = className; if (text != null) node.textContent = text; return node; }
/** Split at a character offset while retaining inline markup in each fragment. */
function splitNode(node, offset) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT); let text, remaining = offset;
  while ((text = walker.nextNode())) { if (remaining <= text.length) break; remaining -= text.length; }
  if (!text) return [node.cloneNode(true),node.cloneNode(false)];
  const left = document.createRange(), right = document.createRange();
  left.selectNodeContents(node); left.setEnd(text,remaining);
  right.selectNodeContents(node); right.setStart(text,remaining);
  const first = node.cloneNode(false), rest = node.cloneNode(false);
  first.append(left.cloneContents()); rest.append(right.cloneContents()); rest.classList.add('continuation');
  return [first,rest];
}
export async function paginate(project, container) {
  const token = ++generation; const settings = project.settings;
  const [width,height] = settings.trim.split('x').map(Number);
  await document.fonts.ready;
  if (token !== generation) return false;
  container.replaceChildren(); let count = 0, body, paper;
  function page(chapter, blank = false) {
    if (++count > 2000) throw Error('This proof exceeds the 2,000-page limit.');
    paper = element('article','paper'); paper.dataset.chapter = chapter.id;
    paper.setAttribute('aria-label',`Page ${count}${blank ? ', intentionally blank' : ''}`);
    paper.style.width = `${width}in`; paper.style.height = `${height}in`;
    container.append(paper);
    body = element('div','paper-body');
    Object.assign(body.style,{top:`${settings.margin}in`,bottom:`${settings.margin}in`,left:`${settings.margin + (count % 2 ? settings.gutter : 0)}in`,right:`${settings.margin + (count % 2 ? 0 : settings.gutter)}in`,fontFamily:settings.font,fontSize:`${settings.size}pt`,lineHeight:String(settings.leading)});
    body.style.setProperty('--indent',`${settings.indent}em`); paper.append(body);
    if (!blank) {
      paper.append(element('div','paper-header',project.title));
      if (settings.numbers) paper.append(element('div','paper-footer',String(count)));
    }
  }
  const overflows = () => body.scrollHeight > body.clientHeight + 1;
  for (const chapter of project.chapters) {
    if (token !== generation) return false;
    if (settings.recto && count % 2 === 1) page(chapter,true);
    page(chapter); body.classList.add('chapter-opening');
    if (settings.dropCap && chapter.kind === 'body') body.classList.add('drop-cap');
    body.append(element('h2','',chapter.title),element('div','ornament',THEMES[settings.theme].ornament));
    const source = document.createElement('div'); source.innerHTML = chapter.html;
    const queue = [...source.childNodes].map(node => {
      if (node.nodeType === 3) return element('p','',node.textContent);
      if (node.nodeName === 'HR') return element('p','scene-break',THEMES[settings.theme].ornament);
      return node.cloneNode(true);
    }).filter(node => node.textContent.trim() || node.nodeName === 'BR');
    for (let node of queue) {
      while (node) {
        body.append(node);
        if (!overflows()) break;
        node.remove();
        const text = node.textContent;
        let low = 0, high = text.length;
        while (low < high) {
          const middle = Math.ceil((low + high)/2), [candidate] = splitNode(node,middle);
          body.append(candidate); const fits = !overflows(); candidate.remove();
          if (fits) low = middle; else high = middle - 1;
        }
        let cut = low;
        if (cut < text.length) { const boundary = text.lastIndexOf(' ',cut - 1); if (boundary > 0) cut = boundary + 1; }
        // Avoid separating a chapter title from all its text.
        if (!cut) {
          if (!body.children.length) throw Error('A content block cannot fit inside the selected margins.');
          if (body.classList.contains('chapter-opening') && body.children.length === 2) throw Error('Chapter heading is too large. Shorten it or reduce the margins.');
          page(chapter); continue;
        }
        const [first,rest] = splitNode(node,cut); body.append(first);
        if (overflows()) { first.remove(); page(chapter); continue; }
        node = rest.textContent ? rest : null;
        if (node) page(chapter);
      }
    }
    await new Promise(resolve => setTimeout(resolve,0));
  }
  let style = document.getElementById('print-dimensions');
  if (!style) { style = document.createElement('style'); style.id = 'print-dimensions'; document.head.append(style); }
  style.textContent = `@page { size: ${width}in ${height}in; margin: 0; }`;
  return token === generation ? count : false;
}
