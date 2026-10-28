import { supabase } from '@alysum/authentication/client.js';
import { authorAccessRequest } from '/core/publishing/author-access-client.js';
const $=id=>document.getElementById(id);
async function check() {try {const {ready,individualPricing}=await authorAccessRequest(supabase,'status');$('accessSetupStatus').textContent=ready ? (individualPricing ? 'Chapter access and individual chapter prices are ready. Authors can connect their shops.' : 'Bundle chapter access is ready. Run the updated script below to enable individual chapter prices, then check again.') : 'The database update has not been detected yet. Run the script, then check again.';}catch(error){$('accessSetupStatus').textContent=error.message;}}
$('checkAccessSetup').addEventListener('click',check);
$('copyAccessSql').addEventListener('click',async()=>{
    try {const response=await fetch('/supabase/live-site/supabase-author-chapter-access.sql',{cache:'no-store'});if(!response.ok)throw Error('Could not load the SQL script.');const sql=await response.text();if(!sql.includes('create table if not exists public.author_access_connections'))throw Error('Could not load the SQL script.');
        $('accessSql').value=sql;try{await navigator.clipboard.writeText(sql);$('accessSqlStatus').textContent='Copied. Paste into Supabase SQL Editor and select Run.';}catch{$('accessSql').hidden=false;$('accessSql').focus();$('accessSql').select();$('accessSqlStatus').textContent='Select and copy the script below, then run it in Supabase.';}
    }catch(error){$('accessSqlStatus').textContent=error.message;}
});
check();
