import {listBodyChapters} from '../writing-engine/manuscript.js';
import {readWorkTags} from '../publishing/work-tags.js';
export const PASS_TEST_PREFIX='ALYTEST';
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function testId(value){if(!uuidPattern.test(value||''))throw Error('Invalid test pass reference.');return value;}
export function testPrice(value){const text=String(value??'').trim();if(!/^\d{1,4}(\.\d{1,2})?$/.test(text))throw Error('Enter a price with up to two decimal places.');const [whole,cents='']=text.split('.'),amount=Number(whole)*100+Number(cents.padEnd(2,'0'));if(amount<1||amount>100000)throw Error('Use a test price from 0.01 to 1,000.');return amount;}
export function passText(html){return String(html||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(p|div|h[1-6]|blockquote)>/gi,'\n\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').trim();}
export function passSnapshot(book,mode,ids=[]){
 if(readWorkTags(book.publish_meta).workType==='fanfiction')throw Error('Fan fiction is free and cannot have purchase passes.');
 if(book.media_format&&book.media_format!=='novel'||book.publish_meta?.epubEdition)throw Error('Choose an original written book for this test.');
 if(!['book','bundle'].includes(mode))throw Error('Choose a whole-book pass or a bundle.');
 const chapters=listBodyChapters(book.sections);
 const selected=mode==='book'?chapters:chapters.filter(ch=>Array.isArray(ids)&&ids.includes(String(ch.id)));
 if(!selected.length||selected.length>500||mode==='bundle'&&(!Array.isArray(ids)||new Set(ids).size!==ids.length||selected.length!==ids.length))throw Error('Choose 1–500 valid chapters.');
 const result=selected.map(ch=>({id:String(ch.id),title:String(ch.title||'Untitled').slice(0,300),text:passText(ch.content)}));
 if(result.some(ch=>!ch.text)||new TextEncoder().encode(JSON.stringify(result)).length>2000000)throw Error('Include readable chapters totaling under 2 MB of text.');return result;
}
export function makeTestCode(random=crypto){const bytes=random.getRandomValues(new Uint8Array(16));const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();return PASS_TEST_PREFIX+'-'+hex.match(/.{8}/g).join('-');}
export function normalizeTestCode(value){const code=String(value||'').trim().toUpperCase().replace(/[\s-]/g,'');if(!/^ALYTEST[0-9A-F]{32}$/.test(code))throw Error('Enter a complete ALYTEST redemption code.');return code;}
export async function testCodeHash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalizeTestCode(value)));return[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function publicTestPass(row){return{id:row.id,bookId:row.source_book_id,title:row.title,bookTitle:row.book_title,mode:row.mode,amount:row.amount,currency:row.currency,chapterCount:row.chapters.length,chapters:row.chapters.map(ch=>({id:ch.id,title:ch.title})),createdAt:row.created_at};}
export function testCodeCsv(codes,pass){const cell=value=>'"'+String(/^[=+@-]/.test(String(value))?"'"+value:value).replace(/"/g,'""')+'"';return[['code','pass','scope','price','currency'],...codes.map(code=>[code,pass.title,pass.mode,(pass.amount/100).toFixed(2),pass.currency])].map(row=>row.map(cell).join(',')).join('\r\n');}

function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
export function sameTestPass(a,b){return ['owner_id','source_book_id','book_title','title','mode','amount','currency','chapters'].every(key=>JSON.stringify(canonical(a[key]))===JSON.stringify(canonical(b[key])));}
