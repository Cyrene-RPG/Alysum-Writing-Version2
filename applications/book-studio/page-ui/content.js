import { createProject, validateProject } from '/core/book-studio/model.js';
export function escapeText(text) { return String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])); }
export function sanitizeHtml(html) {
  const source = new DOMParser().parseFromString(html, 'text/html');
  const allowed = new Set(['P','B','STRONG','I','EM','U','S','SUP','SUB','BR','BLOCKQUOTE','UL','OL','LI','H2','H3','HR']);
  const forbidden = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','TEMPLATE','FORM','IMG','VIDEO','AUDIO','LINK','META']);
  function clean(node) {
    if (node.nodeType === 3) return escapeText(node.textContent);
    if (node.nodeType !== 1 || forbidden.has(node.tagName)) return '';
    const content = [...node.childNodes].map(clean).join('');
    if (!allowed.has(node.tagName)) return content;
    const tag = node.tagName.toLowerCase();
    if (tag === 'br' || tag === 'hr') return `<${tag}/>`;
    return `<${tag}>${content}</${tag}>`;
  }
  return [...source.body.childNodes].map(clean).join('');
}
export function textToHtml(text) {
  return text.split(/\n\s*\n/).filter(s => s.trim()).map(s => s.trim() === '***' ? '<hr/>' : `<p>${escapeText(s.trim()).replace(/\n/g,'<br/>')}</p>`).join('');
}
export function cleanProject(input) {
  const project = validateProject(input);
  project.chapters.forEach(chapter => { chapter.html = sanitizeHtml(chapter.html); });
  return project;
}
export function projectFromBook(book) {
  const chapters = [];
  function walk(items, kind, depth = 0) {
    if (depth > 40 || !Array.isArray(items)) throw Error('Invalid book structure.');
    for (const item of items) {
      if (item.kind === 'note') continue;
      if (item.kind === 'folder') walk(item.children || [], kind, depth + 1);
      else chapters.push({ id: crypto.randomUUID(), title: item.title, html: sanitizeHtml(item.content || ''), kind });
      if (chapters.length > 1000) throw Error('Maximum 1,000 sections.');
    }
  }
  for (const kind of ['front','body','back']) walk(book.sections?.[kind] || [],kind);
  return createProject(book.title, chapters);
}
export async function readFile(file) {
  if (file.size > 10 * 1024 * 1024) throw Error('Choose a file smaller than 10 MB.');
  const extension = file.name.split('.').pop().toLowerCase();
  if (extension === 'json') {
    const data = JSON.parse(await file.text());
    return data.format === 'alysum-book-backup' ? projectFromBook(data.book) : cleanProject(data);
  }
  let html;
  let warnings = 'Imported text and basic emphasis. Images, tables, footnotes and advanced styles are not retained in this test edition. Review every section before exporting.';
  if (extension === 'docx') {
    const module = await import('https://esm.sh/mammoth@1.12.0');
    const mammoth = module.default || module;
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { convertImage: mammoth.images.imgElement(() => Promise.resolve({src:''})) });
    html = result.value;
    if (result.messages.length) warnings += ' ' + result.messages.map(m => m.message).join(' ');
  } else if (extension === 'html') html = await file.text();
  else if (extension === 'txt') html = (await file.text()).split(/\n\s*\n/).map(s => /^chapter\s+\S+/i.test(s.trim()) && !s.trim().includes('\n') ? `<h1>${escapeText(s.trim())}</h1>` : textToHtml(s)).join('');
  else throw Error('Choose DOCX, TXT, HTML, or a project JSON file.');
  const doc = new DOMParser().parseFromString(html,'text/html');
  const chapters = []; let chapter = null;
  for (const node of doc.body.childNodes) {
    if (node.nodeName === 'H1') { chapter = { id: crypto.randomUUID(), title: node.textContent, html:'', kind:'body' }; chapters.push(chapter); }
    else {
      const safe = sanitizeHtml(node.outerHTML || escapeText(node.textContent));
      if (!safe.trim()) continue;
      if (!chapter) { chapter = {id:crypto.randomUUID(),title:'Opening',html:'',kind:'body'}; chapters.push(chapter); }
      chapter.html += safe;
    }
  }
  if (!chapters.length) throw Error('No manuscript text was found.');
  return { ...createProject(file.name.replace(/\.[^.]+$/,''),chapters), importWarning: warnings };
}
