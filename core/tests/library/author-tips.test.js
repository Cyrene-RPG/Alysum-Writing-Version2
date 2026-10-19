import test from 'node:test';
import assert from 'node:assert/strict';
import {authorTipOptions,paypalTipUrl,cashAppTip} from '../../library/author-tips.js';

test('Ko-fi uses the author-saved profile for its real embedded tip panel',()=>{
    const [option]=authorTipOptions({kofi:'https://ko-fi.com/Author_Name?ref=profile'});
    assert.equal(option.url,'https://ko-fi.com/Author_Name');
    const frame=new URL(option.embedUrl);assert.equal(frame.hostname,'ko-fi.com');assert.equal(frame.pathname,'/Author_Name/');
    assert.equal(frame.searchParams.get('widget'),'true');assert.equal(frame.searchParams.get('embed'),'true');
});
test('tips are not sent to shop items, lookalike domains or URLs with credentials',()=>{
    for(const kofi of ['https://ko-fi.com/s/product','https://ko-fi.com/author/shop','https://ko-fi.com.evil.example/author','https://name:secret@ko-fi.com/author','javascript:alert(1)','http://ko-fi.com/author'])assert.deepEqual(authorTipOptions({kofi}),[]);
});
test('PayPal amount links preserve only the author’s handle and chosen amount and currency',()=>{
    assert.equal(paypalTipUrl('https://www.paypal.me/Author/100','2.50','GBP'),'https://paypal.me/Author/2.50GBP');
    assert.equal(paypalTipUrl('https://paypal.me/Author','1','USD'),'https://paypal.me/Author/1.00USD');
});
test('invalid or ambiguous tip amounts cannot open a payment link',()=>{
    for(const amount of ['','0','-1','1e3','1.234','10001','NaN','1,50'])assert.equal(paypalTipUrl('https://paypal.me/Author',amount,'USD'),'');
    assert.equal(paypalTipUrl('https://paypal.me.evil.example/Author','5','USD'),'');
    assert.equal(paypalTipUrl('https://paypal.me/Author','5','INVALID'),'');
});
test('Cash App is recognized without pretending to submit a payment',()=>{
    assert.deepEqual(authorTipOptions({cashapp:'https://cash.app/$Writer'}),[{kind:'cashapp',label:'Cash App',url:'https://cash.app/$Writer'}]);
    assert.deepEqual(authorTipOptions({cashapp:'https://cash.app.evil.example/$Writer'}),[]);
});
test('unconfigured authors and unrelated social links do not create tip buttons',()=>{
    assert.deepEqual(authorTipOptions({social:'https://example.com',website:'https://example.com',patreon:'https://patreon.com/example'}),[]);
    assert.deepEqual(authorTipOptions(null),[]);
});

test('Cash App supports saved cashtags, encoded dollar signs and amount links',()=>{
    for(const raw of ['$Writer','https://$Writer','https://cash.app/%24Writer','https://cash.app/$Writer/5.00']) {
        assert.equal(authorTipOptions({cashapp:raw})[0]?.url,'https://cash.app/$Writer');
    }
});
test('Cash App amount entry copies USD without inventing an unsupported checkout URL',()=>{
    assert.deepEqual(cashAppTip('https://cash.app/$Writer','2.5'),{url:'https://cash.app/$Writer',amount:'2.50',currency:'USD'});
    for(const amount of ['','0','-5','1e3','1.234','10001','1,50'])assert.equal(cashAppTip('https://cash.app/$Writer',amount),null);
    assert.equal(cashAppTip('https://cash.app.evil.example/$Writer','5'),null);
});
