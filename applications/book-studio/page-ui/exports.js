import { createArchive } from '/core/book-studio/archive.js';
import { escapeText, sanitizeHtml } from './content.js';
export function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name.replace(/[<>:"/\\|?*]/g,'-'); link.click(); setTimeout(() => URL.revokeObjectURL(url),30000);
}
export function exportEpub(project) {
  const xml = escapeText;
  const wrap = (title,body) => `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en"><head><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`;
  // XMLSerializer makes HTML void elements valid XHTML for reading systems.
  const xhtml = html => { const doc = new DOMParser().parseFromString(sanitizeHtml(html),'text/html'); return [...doc.body.childNodes].map(n => new XMLSerializer().serializeToString(n)).join(''); };
  const files = [['mimetype','application/epub+zip'],['META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>']];
  files.push(['EPUB/nav.xhtml',wrap('Contents',`<nav epub:type="toc"><h1>Contents</h1><ol>${project.chapters.map((c,i)=>`<li><a href="chapter-${i}.xhtml">${xml(c.title)}</a></li>`).join('')}</ol></nav>`)]);
  files.push(['EPUB/style.css',`body {font-family:serif;line-height:${project.settings.leading}} h1 {text-align:center} p {text-indent:${project.settings.indent}em;margin:0 0 .4em} hr {margin:1.5em auto;width:25%}`]);
  project.chapters.forEach((c,i)=>files.push([`EPUB/chapter-${i}.xhtml`,wrap(c.title,`<h1>${xml(c.title)}</h1>${xhtml(c.html)}`)]));
  files.push(['EPUB/package.opf',`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:${crypto.randomUUID()}</dc:identifier><dc:title>${xml(project.title)}</dc:title><dc:creator>${xml(project.author || 'Anonymous')}</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z/,'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="style" href="style.css" media-type="text/css"/>${project.chapters.map((c,i)=>`<item id="c${i}" href="chapter-${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${project.chapters.map((c,i)=>`<itemref idref="c${i}"/>`).join('')}</spine></package>`]);
  download(createArchive(files),`${project.title}.epub`);
}
