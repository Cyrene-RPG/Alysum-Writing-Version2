import {mountManuscriptExport} from '../page-ui/manuscript-export-form.js';
import {parseManuscriptHtml} from '../page-ui/manuscript-html.js';
const opening='<p>The last train left the valley at dawn. Mira watched its lights pass between the pines until the mountain took them, and then she was alone with the letter.</p><p>It had arrived without a stamp, folded into the shape of a bird. Her brother had taught her that fold when they were children. He had been missing for <em>eleven years</em>.</p><p>At the edge of the platform, someone had left a lantern burning. There was no wind, but the flame leaned toward the abandoned station as though listening to a voice inside.</p>';
const book={id:'manuscript-export-sample',title:'The Last Station',sections:{front:[],body:[{id:'sample-1',title:'Chapter 1 · The letter',content:opening.repeat(6)+'<p class="scene-break scene-break--swords"><span class="scene-break-glyph"></span></p><h2>A letter</h2><blockquote><p><em>Dear Mira,</em></p><p>If you have found the station, please wait for me. You are not too late.</p></blockquote><ul><li>The platform was empty.</li><li>The lantern was still burning.</li></ul>'+opening.repeat(3)},{id:'sample-2',title:'Chapter 2 · The waiting room',content:opening.repeat(6)}],back:[]}};
// Render a small, deliberately styled excerpt; the exported file uses the full sample.
document.getElementById('sampleCopy').innerHTML=opening+'<p class="sample-break">✦ ⚔ ✦</p><p><em>Dear Mira,</em></p><p>If you have found the station, please wait for me. You are not too late.</p>';
mountManuscriptExport({button:document.getElementById('testExport'),getBook:()=>book,getAuthor:()=> 'Mira Vale',storageScope:'export-sample'});
const cases=[
 ['inline italics',()=>JSON.stringify(parseManuscriptHtml('<p>A sw<em>ord</em> and <span style="font-style:italic;font-size:90px">a letter</span>.</p>'))===JSON.stringify([{kind:'paragraph',runs:[{text:'A sw',italic:false},{text:'ord',italic:true},{text:' and ',italic:false},{text:'a letter',italic:true},{text:'.',italic:false}],quote:false}])],
 ['headings and nested lists',()=>parseManuscriptHtml('<h2>Heading</h2><ul><li>One<ul><li>Two</li></ul>end</li></ul>').map(b=>b.runs.map(r=>r.text).join('')).join('|')==='Heading|One|Two|end'],
 ['all scene break types',()=>parseManuscriptHtml('<p class="scene-break">ornament</p><p class="scene-spacer"> </p><hr class="scene-rule">').every(b=>b.kind==='scene')&&parseManuscriptHtml('<p class="scene-break"></p><hr>').length===2],
 ['scripts and images excluded',()=>parseManuscriptHtml('<script>bad()</script><img src=x onerror=bad()><p>Safe &amp; sound</p>').map(b=>b.runs.map(r=>r.text).join('')).join('')==='Safe & sound'],
 ['line breaks retained',()=>parseManuscriptHtml('<p>One<br>Two</p>')[0].runs.map(r=>r.text).join('')==='One\nTwo'],
 ['source is unchanged',()=>{const source='<p class="alysum-indent" style="font-size:25px"><em>Text</em></p>';parseManuscriptHtml(source);return source==='<p class="alysum-indent" style="font-size:25px"><em>Text</em></p>';}],
];
const failed=cases.filter(([,test])=>{try{return !test();}catch{return true;}}).map(([name])=>name);
document.getElementById('testStatus').textContent=failed.length?'Text checks failed: '+failed.join(', '):`${cases.length} text conversion checks passed.`;
