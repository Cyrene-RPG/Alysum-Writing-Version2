import test from 'node:test';
import assert from 'node:assert/strict';
import {saveAuthorSupportLinks} from '../../account/support-links.js';

test('support link save executes the public profile write and waits for its confirmation',async()=>{
    let complete;let executed=false;const pending=new Promise(resolve=>{complete=resolve;});
    const client={from(table){assert.equal(table,'users');return{update(body){assert.deepEqual(body,{support_links:{cashapp:'https://cash.app/$Writer'}});return{eq(key,value){assert.equal(key,'id');assert.equal(value,'owner');return{async select(columns){assert.equal(columns,'id');executed=true;return pending;}};}};}};}};
    let settled=false;const saving=saveAuthorSupportLinks(client,'owner',{cashapp:'https://cash.app/$Writer'}).then(()=>{settled=true;});
    assert.equal(executed,true);assert.equal(settled,false);complete({data:[{id:'owner'}],error:null});await saving;assert.equal(settled,true);
});
test('failed or empty profile writes cannot be reported as saved',async()=>{
    for(const result of [{error:{message:'Permission denied'},data:null},{error:null,data:[]},{error:null,data:[{id:'someone-else'}]}]){
        const client={from(){return{update(){return{eq(){return{async select(){return result;}};}};}};}};
        await assert.rejects(saveAuthorSupportLinks(client,'owner',{}),/Permission denied|not saved/);
    }
});
