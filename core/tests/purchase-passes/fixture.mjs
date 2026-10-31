import {readFile} from 'node:fs/promises';
import {handlePassTest} from '../../server/http-handlers/pass-test.mjs';
export const OWNER='10000000-0000-4000-8000-000000000001',BUYER='20000000-0000-4000-8000-000000000002',OTHER='30000000-0000-4000-8000-000000000003';
export const source={id:'book',user_id:OWNER,title:'The Last Lantern',media_format:'novel',publish_meta:{workType:'original'},sections:{body:[{id:'one',title:'Chapter 1',content:'<p>PRIVATE ONE</p>'},{id:'two',title:'Chapter 2',content:'<p>PRIVATE TWO</p>'},{id:'three',title:'Chapter 3',content:'<p>PRIVATE THREE</p>'}]}};
export async function createPassFixture(){
 const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema auth,public to anon,authenticated,service_role;create table auth.users(id uuid primary key);create table public.books(id text primary key,user_id uuid,title text,media_format text,publish_meta jsonb,sections jsonb,updated bigint default 1);create table public.library_book_moderation(book_id text,visibility text);insert into auth.users values('${OWNER}'),('${BUYER}'),('${OTHER}');`);
 const migration=await readFile(new URL('../../../supabase/live-site/supabase-purchase-pass-test.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 await db.query('insert into books(id,user_id,title,media_format,publish_meta,sections) values($1,$2,$3,$4,$5,$6)',[source.id,source.user_id,source.title,source.media_format,JSON.stringify(source.publish_meta),JSON.stringify(source.sections)]);
 const calls=[];
 const quote=id=>{if(!/^[a-z_][a-z0-9_]*$/i.test(id))throw Error('Invalid test identifier');return '"'+id+'"';};
 const services={async user(req){const id=req.headers.get('Authorization')?.slice(7);if(![OWNER,BUYER,OTHER].includes(id))throw Object.assign(Error('Sign in.'),{status:401});return{id,email_confirmed_at:'now'};},async db(table,{method='GET',query={},body}={}){
  calls.push({table,method,body});
  if(table.startsWith('rpc/')){const params=Object.values(body||{}).map(value=>value&&typeof value==='object'?JSON.stringify(value):value),args=Object.keys(body||{}).map((key,index)=>quote(key)+' => $'+(index+1));try{const result=await db.query('select public.'+quote(table.slice(4))+'('+args.join(',')+') as value',params);return result.rows[0].value;}catch(error){if(table==='rpc/redeem_purchase_pass_test'||table==='rpc/create_purchase_pass_test_batch')throw Object.assign(Error('This test code or batch is unavailable.'),{status:409});throw error;}}
  const params=[],bind=value=>{params.push(value);return'$'+params.length;};
  const where=[];for(const[key,value]of Object.entries(query)){if(['select','order','limit'].includes(key))continue;if(value==='is.null')where.push(quote(key)+' is null');else if(value.startsWith('eq.'))where.push(quote(key)+' = '+bind(value.slice(3)));else if(value.startsWith('in.('))where.push(quote(key)+' in ('+value.slice(4,-1).split(',').map(bind).join(',')+')');else throw Error('Unsupported filter '+value);}
  let sql;
  if(method==='POST'){const keys=Object.keys(body);sql='insert into '+quote(table)+'('+keys.map(quote).join(',')+') values('+keys.map(key=>bind(body[key]&&typeof body[key]==='object'?JSON.stringify(body[key]):body[key])).join(',')+') on conflict do nothing returning *';}
  else if(method==='PATCH'){sql='update '+quote(table)+' set '+Object.entries(body).map(([key,value])=>quote(key)+' = '+bind(value&&typeof value==='object'?JSON.stringify(value):value)).join(',')+(where.length?' where '+where.join(' and '):'')+' returning *';}
  else{const fields=query.select?query.select.split(',').map(quote).join(','):'*';sql='select '+fields+' from '+quote(table)+(where.length?' where '+where.join(' and '):'');if(query.order){const [field,direction]=query.order.split('.');sql+=' order by '+quote(field)+(direction==='desc'?' desc':' asc');}if(query.limit!=null)sql+=' limit '+Number(query.limit);}
  return(await db.query(sql,params)).rows;
 }};
 return{db,calls,services,async run(action,{body,as=OWNER,query={}}={}){const url=new URL('/api/pass-test','https://alysumwriting.com');url.searchParams.set('action',action);for(const[key,value]of Object.entries(query))url.searchParams.set(key,value);return handlePassTest(new Request(url,{method:body?'POST':'GET',headers:{Origin:url.origin,...(as?{Authorization:'Bearer '+as}:{})},body:body?JSON.stringify(body):undefined}),{},{services});}};
}
