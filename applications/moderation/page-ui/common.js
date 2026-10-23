export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const $=s=>document.querySelector(s);
export const date=s=>s?new Date(s).toLocaleString():'Not recorded';
export const label=s=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
export const badge=s=>'<span class="md-badge '+(['Banned','Suspended','hidden','removed'].includes(s)?'red':['Active','visible','resolved','granted'].includes(s)?'green':'neutral')+'">'+esc(label(s))+'</span>';
export const button=(text,action,id='',cls='')=>'<button type="button" data-live="'+action+'" data-id="'+esc(id)+'" class="'+cls+'">'+esc(text)+'</button>';
export function title(name,copy='',actions=''){return '<div class="md-heading"><div><p class="md-eyebrow">Alysum / Moderation</p><h1 id="md-page-title" tabindex="-1">'+esc(name)+'</h1><p>'+esc(copy)+'</p></div><div class="md-heading-actions">'+actions+'</div></div>';}
export function table(headers,rows){return '<section class="md-panel"><div class="md-table-wrap"><table class="md-table"><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+(rows.length?'':'<p class="md-empty">No results in this view.</p>')+'</section>';}
export function formShell(id,body,submit='Save',data=''){return '<form id="'+id+'" '+data+' data-request-id="'+crypto.randomUUID()+'">'+body+'<p class="md-error" data-form-error role="alert"></p><div class="md-actions"><button type="submit" class="md-primary">'+esc(submit)+'</button>'+button('Cancel','close')+'</div></form>';}
export function field(id,text,type='textarea',value=''){return '<div class="mc-field"><label for="'+id+'">'+esc(text)+'</label>'+(type==='textarea'?'<textarea id="'+id+'" required maxlength="4000">'+esc(value)+'</textarea>':'<input id="'+id+'" type="'+type+'" value="'+esc(value)+'" required>')+'</div>';}
export function select(id,text,values,current=''){return '<div class="mc-field"><label for="'+id+'">'+esc(text)+'</label><select id="'+id+'">'+values.map(([v,l])=>'<option value="'+esc(v)+'" '+(v===current?'selected':'')+'>'+esc(l)+'</option>').join('')+'</select></div>';}
let lastFocus;
export function modal(name,body){lastFocus=document.activeElement;$('#md-dialog-title').textContent=name;$('#md-dialog-body').innerHTML=body;if(!$('#md-dialog').open){document.body.style.overflow='hidden';$('#md-dialog').showModal();}}
export function close(){if($('#md-dialog').open)$('#md-dialog').close();document.body.style.overflow='';lastFocus?.isConnected&&lastFocus.focus({preventScroll:true});}
export function toast(text){$('#md-toast').textContent=text;$('#md-toast').hidden=false;clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>$('#md-toast').hidden=true,6000);}
export function showError(error){const target=$('[data-form-error]')||$('#mc-page-error');if(target)target.textContent=error.message||String(error);else toast(error.message||String(error));}
export function clearPrivate(){close();$('#md-screen').replaceChildren();$('#md-nav').replaceChildren();$('#md-toast').hidden=true;}
export function bindDialog(){document.querySelector('[data-action="close-dialog"]')?.addEventListener('click',close);document.querySelector('#md-dialog').addEventListener('cancel',e=>{e.preventDefault();close();});}
