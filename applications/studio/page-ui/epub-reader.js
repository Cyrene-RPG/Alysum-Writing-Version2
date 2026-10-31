import {validateEpubFile} from '/core/ebooks/model.js';
const ZIP_URL='https://esm.sh/fflate@0.8.2';
const escape=text=>String(text||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const xml=text=>{if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('EPUB XML must not include document entities.');const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('The EPUB contains invalid XML.');return doc;};
const elements=(doc,name)=>[...doc.getElementsByTagNameNS('*',name)];
export function epubPath(base,href){
 if(!href||/^[a-z][a-z0-9+.-]*:|^\/|[\\\u0000]/i.test(href))throw Error('The EPUB refers to an unsupported resource.');
 const url=new URL(href,'https://epub.invalid/'+base);if(url.origin!=='https://epub.invalid')throw Error('External EPUB resources are not supported.');return decodeURIComponent(url.pathname.slice(1));
}
/** ZIP input is bounded before and during decompression, including highly compressed archives. */
export async function unpackEpub(bytes,zipModule){
 const {Unzip,UnzipInflate}=zipModule||await import(ZIP_URL);
 let total=0,count=0,failure;const files=new Map();
 const unzip=new Unzip(file=>{
  if(++count>3000){failure=Error('This EPUB contains too many files.');return;}
  let size=0;const chunks=[];
  file.ondata=(error,data,final)=>{
   if(failure)return;if(error){failure=Error('This EPUB archive could not be read.');return;}
   size+=data.length;total+=data.length;
   if(size>8*1024*1024||total>60*1024*1024){failure=Error('The expanded EPUB is too large.');file.terminate();return;}
   chunks.push(data);if(final){const out=new Uint8Array(size);let offset=0;for(const part of chunks){out.set(part,offset);offset+=part.length;}if(files.has(file.name))failure=Error('Duplicate EPUB file paths are not supported.');files.set(file.name,out);}
  };
  if(file.originalSize>8*1024*1024){failure=Error('An EPUB resource is too large.');return;}file.start();
 });
 unzip.register(UnzipInflate);
 for(let offset=0;offset<bytes.length;offset+=65536){unzip.push(bytes.subarray(offset,offset+65536),offset+65536>=bytes.length);if(failure)throw failure;}
 if(failure)throw failure;return files;
}
export function readEpubArchive(files,fileName='Book.epub'){
 const read=path=>{const bytes=files.get(path);if(!bytes)throw Error('The EPUB is missing '+path+'.');return new TextDecoder('utf-8',{fatal:true}).decode(bytes);};
 if(read('mimetype').trim()!=='application/epub+zip')throw Error('This is not a valid EPUB book.');
 if(files.has('META-INF/encryption.xml')){
  const encryption=xml(read('META-INF/encryption.xml'));
  const algorithms=elements(encryption,'EncryptionMethod').map(el=>el.getAttribute('Algorithm'));
  if(algorithms.some(value=>!['http://www.idpf.org/2008/embedding','http://ns.adobe.com/pdf/enc#RC'].includes(value)))throw Error('DRM-protected EPUBs cannot be uploaded. Export an unencrypted EPUB.');
 }
 const container=xml(read('META-INF/container.xml')),root=elements(container,'rootfile')[0]?.getAttribute('full-path');
 const packagePath=epubPath('',root),opf=xml(read(packagePath));
 if(elements(opf,'meta').some(el=>el.getAttribute('property')==='rendition:layout'&&el.textContent==='pre-paginated'))throw Error('Fixed-layout EPUBs are not supported yet. Choose a reflowable EPUB.');
 const manifest=new Map(elements(opf,'item').map(item=>[item.getAttribute('id'),item]));
 const chapters=[];let images=0;
 for(const ref of elements(opf,'itemref')){
  if(ref.getAttribute('linear')==='no')continue;
  const item=manifest.get(ref.getAttribute('idref'));if(!item)throw Error('The EPUB reading order is incomplete.');
  if((item.getAttribute('properties')||'').split(/\s+/).includes('nav'))continue;
  if(!['application/xhtml+xml','text/html'].includes(item.getAttribute('media-type')))throw Error('This EPUB uses an unsupported chapter format.');
  const doc=xml(read(epubPath(packagePath,item.getAttribute('href'))));
  const body=elements(doc,'body')[0];if(!body)throw Error('An EPUB chapter has no reading body.');
  for(const node of [...body.querySelectorAll('script,style,iframe,object,embed,svg,math,audio,video,form,link')])node.remove();
  images+=body.querySelectorAll('img').length;
  const blocks=[];
  function walk(node){
   if(node.nodeType===3){return escape(node.textContent);}
   if(node.nodeType!==1)return '';
   const tag=node.localName.toLowerCase();if(tag==='img')return '';
   const content=[...node.childNodes].map(walk).join('');
   if(tag==='br')return '<br>';
   return /^(p|h[1-6]|blockquote|pre|ul|ol|li|b|strong|i|em|u|s|sup|sub)$/.test(tag)?`<${tag}>${content}</${tag}>`:content;
  }
  blocks.push(...[...body.childNodes].map(walk));const content=blocks.join('\n');
  if(!body.textContent.trim())continue;
  chapters.push({id:crypto.randomUUID(),kind:'chapter',title:body.querySelector('h1,h2,h3')?.textContent.trim().slice(0,300)||elements(doc,'title')[0]?.textContent.trim().slice(0,300)||`Section ${chapters.length+1}`,content});
 }
 if(!chapters.length||chapters.length>500)throw Error('Choose an EPUB with 1–500 readable sections.');
 if(JSON.stringify(chapters).length>1800000)throw Error('The book text is too large for paid reading on Alysum.');
 return {title:elements(opf,'title')[0]?.textContent.trim().slice(0,200)||fileName.replace(/\.epub$/i,''),author:elements(opf,'creator')[0]?.textContent.trim().slice(0,200)||'',sections:{front:[],body:chapters,back:[]},images};
}
export async function readEpub(file){validateEpubFile(file);return readEpubArchive(await unpackEpub(new Uint8Array(await file.arrayBuffer())),file.name);}
