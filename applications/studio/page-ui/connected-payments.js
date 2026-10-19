import { supabase } from '@alysum/authentication/client.js';
import { authorAccessRequest } from '/core/publishing/author-access-client.js';
const $=id=>document.getElementById(id);
const book=new URLSearchParams(window.location.search).get('book');
if(book) {
    $('openPublish').href=`/publish?book=${encodeURIComponent(book)}#chapterAccessCard`;$('openPublish').textContent='Return to publishing →';
    $('backToBook').href=`/publish?book=${encodeURIComponent(book)}`;$('backToBook').textContent='← Publishing';
}
function provider() {
    const kofi=$('shopProvider').value==='kofi';
    $('shopInstructions').textContent=kofi?'In Ko-fi, open API → Webhooks → Advanced and copy your Verification Token.':'In Payhip, open Settings → Developer and copy your API key. You will add the webhook address there next.';
    $('shopSecretLabel').textContent=kofi?'Ko-fi verification token':'Payhip API key';
    $('providerSettings').href=kofi?'https://ko-fi.com/manage/webhooks':'https://payhip.com/settings/developer';
    $('shopSecret').value='';
}
$('shopProvider').addEventListener('change',provider);
function showAddress(address) {$('shopWebhook').value=address;$('shopWebhookCard').hidden=false;}
async function load() {
    const status=await authorAccessRequest(supabase,'status');
    if(!status.ready) {$('shopStatus').textContent='Chapter access needs its one-time database update. No payment-platform registration is required.';$('shopSetup').hidden=false;return;}
    const {data}=await supabase.auth.getSession();
    if(!data.session) {$('shopStatus').textContent='Sign in to connect your own shop.';$('shopLogin').hidden=false;return;}
    $('shopConnectCard').hidden=false;
    const {connections}=await authorAccessRequest(supabase,'connections');
    $('connectionList').replaceChildren();
    for(const connection of connections) {
        const row=document.createElement('p');const name=connection.provider==='kofi'?'Ko-fi':'Payhip';
        row.append(document.createTextNode(`${name} — ${connection.verified_at?'Receiving verified sale notices':'Saved; waiting for a sale notice'}. `));
        const button=document.createElement('button');button.type='button';button.className='pub-ghost';button.textContent='Show webhook address';button.addEventListener('click',()=>showAddress(connection.webhookUrl));row.append(button);$('connectionList').append(row);
    }
    $('shopConnections').hidden=!connections.length;
    const {sales}=await authorAccessRequest(supabase,'sales');$('shopSalesList').replaceChildren();
    if(!sales.length) $('shopSalesList').textContent='No purchases received yet.';
    for(const sale of sales) {
        const row=document.createElement('p');row.append(document.createTextNode(`${sale.transaction_id} — ${sale.status==='paid'?'Access granted':'Access revoked'} `));
        if(sale.status==='paid') {const revoke=document.createElement('button');revoke.type='button';revoke.className='pub-ghost';revoke.textContent='Revoke access';revoke.addEventListener('click',async()=>{revoke.disabled=true;try {await authorAccessRequest(supabase,'revoke',{method:'POST',body:{saleId:sale.id}});await load();}catch(error){$('shopStatus').textContent=error.message;revoke.disabled=false;}});row.append(revoke);}
        $('shopSalesList').append(row);
    }
    $('shopSales').hidden=false;$('shopStatus').textContent='Connect a service once, then choose which chapters its product unlocks in Publish.';
}
$('connectShop').addEventListener('click',async()=>{
    const button=$('connectShop');button.disabled=true;$('shopError').hidden=true;
    try {const result=await authorAccessRequest(supabase,'connect',{method:'POST',body:{provider:$('shopProvider').value,secret:$('shopSecret').value}});$('shopSecret').value='';showAddress(result.webhookUrl);await load();}
    catch(error){$('shopError').textContent=error.message;$('shopError').hidden=false;}
    finally {button.disabled=false;}
});
$('copyShopWebhook').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('shopWebhook').value);$('webhookCopyStatus').textContent='Copied. Paste it into your service’s webhook settings and save.';}catch{$('shopWebhook').focus();$('shopWebhook').select();$('webhookCopyStatus').textContent='Select and copy this address.';}});
load().catch(error=>{$('shopStatus').textContent=error.message;});
