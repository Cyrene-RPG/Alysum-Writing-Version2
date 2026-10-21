import test from 'node:test';
import assert from 'node:assert/strict';
import {listPublicAnnouncements,UPDATE_PAGE_SIZE} from '../../publishing/announcements.js';

// Evaluate the filters sent to PostgREST against mixed-audience fixture rows.
function feedClient(rows) {
    const filters=[],ordering=[];let first=0,last=Infinity;
    const query={
        select(){return query;},
        eq(column,value){filters.push([column,value]);return query;},
        order(column,{ascending}){ordering.push([column,ascending]);return query;},
        range(start,end){first=start;last=end;return query;},
        then(resolve,reject){
            const data=rows.filter(row=>filters.every(([key,value])=>row[key]===value)).sort((a,b)=>{
                for(const [key,ascending] of ordering){const result=a[key]===b[key]?0:a[key]<b[key]?-1:1;if(result)return ascending?result:-result;}
                return 0;
            }).slice(first,last+1);
            return Promise.resolve({data,error:null}).then(resolve,reject);
        },
    };
    return {from(table){assert.equal(table,'announcements');return query;}};
}
const post=(id,scope,author,category='announcement',status='published',published='2026-10-21T12:00:00Z')=>({
    id,scope,author_id:author,category,status,published_at:status==='published'?published:null,title:id,body:'Update text',
});
const rows=[
    post('site','site','staff','fixed'),
    post('author-a','author','writer-a'),
    post('author-b','author','writer-b'),
    post('own-draft','author','writer-a','announcement','draft'),
    post('other-draft','author','writer-b','announcement','draft'),
    post('site-draft','site','staff','new','draft'),
];

test('What’s New includes site posts and announcements from multiple authors, excluding all drafts',async()=>{
    const posts=await listPublicAnnouncements(feedClient(rows));
    assert.deepEqual(new Set(posts.map(post=>post.id)),new Set(['site','author-a','author-b']));
    assert.ok(posts.every(post=>post.status==='published'));
});
test('Category filtering includes every author while author links remain specific to their author',async()=>{
    const announcements=await listPublicAnnouncements(feedClient(rows),{category:'announcement'});
    assert.deepEqual(new Set(announcements.map(post=>post.id)),new Set(['author-a','author-b']));
    const author=await listPublicAnnouncements(feedClient(rows),{authorId:'writer-a'});
    assert.deepEqual(author.map(post=>post.id),['author-a']);
    const unavailable=await listPublicAnnouncements(feedClient(rows),{postId:'own-draft'});
    assert.deepEqual(unavailable,[]);
    const detail=await listPublicAnnouncements(feedClient(rows),{postId:'author-b',category:'fixed'});
    assert.deepEqual(detail.map(post=>post.id),['author-b']);
});
test('Mixed-author pagination uses one stable timeline without gaps or duplicate posts',async()=>{
    const data=Array.from({length:UPDATE_PAGE_SIZE+7},(_,i)=>post('post-'+String(i).padStart(3,'0'),i%3===0?'site':'author','writer-'+(i%4)));
    const first=await listPublicAnnouncements(feedClient(data));
    const second=await listPublicAnnouncements(feedClient(data),{offset:UPDATE_PAGE_SIZE});
    assert.equal(first.length,UPDATE_PAGE_SIZE);assert.equal(second.length,7);
    const ids=[...first,...second].map(post=>post.id);
    assert.equal(new Set(ids).size,data.length);
    assert.deepEqual(ids,data.map(post=>post.id).sort().reverse());
});
