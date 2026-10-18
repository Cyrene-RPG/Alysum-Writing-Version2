import { countWordsInSections } from './word-count.js';

function chapters(sections) {
    const result=[];
    function walk(items,path) {
        for(const item of items||[]) {
            if(item.kind==='folder'||(!item.kind&&Array.isArray(item.children)))walk(item.children,[...path,String(item.title||'')]);
            else if(item.kind!=='note')result.push({item,key:JSON.stringify([...path,String(item.title||'').trim()])});
        }
    }
    for(const key of ['front','body','back'])walk(sections?.[key],[key]);
    return result;
}

/** Prepare a private backup and a main-record patch; neither changes the source revision. */
export function prepareDraftPromotion(source, main, { now=Date.now(), makeId=()=>crypto.randomUUID() }={}) {
    if(!source?.draft_parent_id||String(source.draft_parent_id)!==String(main?.id)||main.draft_parent_id||String(source.id)===String(main.id))throw new Error('Choose a revision belonging to this main draft.');
    if((source.media_format||'novel')!==(main.media_format||'novel'))throw new Error('The revision and main draft must use the same book format.');
    const sections=structuredClone(source.sections||{front:[],body:[],back:[]});
    if(!countWordsInSections(sections))throw new Error('Add writing to this revision before making it the main draft.');
    // Preserve existing chapter IDs only for unambiguous matches. Reordering or
    // duplicate chapter names must never guess which reader chapter to replace.
    const prior=chapters(main.sections),next=chapters(sections);
    const priorIds=new Set(prior.map(({item})=>String(item.id)));
    const byKey=new Map(),counts=new Map();
    for(const entry of prior){const matches=byKey.get(entry.key)||[];matches.push(entry.item);byKey.set(entry.key,matches);}
    for(const entry of next)counts.set(entry.key,(counts.get(entry.key)||0)+1);
    const used=new Set(next.filter(({item})=>priorIds.has(String(item.id))).map(({item})=>String(item.id)));
    for(const {item,key} of next) {
        const matches=byKey.get(key)||[];
        if(!priorIds.has(String(item.id))&&matches.length===1&&counts.get(key)===1&&!used.has(String(matches[0].id))){item.id=matches[0].id;used.add(String(item.id));}
    }
    const bodyIds=new Set(chapters({body:sections.body}).map(({item})=>String(item.id)));
    const keepIds=ids=>(Array.isArray(ids)?ids:[]).map(String).filter(id=>bodyIds.has(id));
    const publishedIds=keepIds(main.published_chapter_ids);
    const existingMeta=structuredClone(main.publish_meta||{});
    const selected=keepIds(existingMeta.draftChapterIds?.length?existingMeta.draftChapterIds:main.published_chapter_ids);
    const updated=Math.max(Number(now),Number(main.updated||0)+1);
    const backupId=String(makeId());
    if(!backupId||[String(main.id),String(source.id)].includes(backupId))throw new Error('Could not create a separate backup ID.');
    return {
        backup:{id:backupId,title:main.title,sections:structuredClone(main.sections),words:countWordsInSections(main.sections),media_format:main.media_format||'novel',draft_parent_id:String(main.id),draft_label:`Previous main · ${new Date(now).toISOString().slice(0,19).replace('T',' ')} UTC`,publish_meta:{},published_chapter_ids:[],is_published:false,created:now,updated:now},
        patch:{title:source.title||main.title,sections,words:countWordsInSections(sections),published_chapter_ids:publishedIds,publish_meta:{...existingMeta,draftChapterIds:selected,revisionNeedsPublishReview:true},updated},
    };
}

export function needsPromotedChapterSelection(book, chapterIds) {
    return Boolean(book?.publish_meta?.revisionNeedsPublishReview) && !chapterIds?.length;
}
