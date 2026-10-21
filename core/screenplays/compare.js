import {normalize,textOf,sceneDetails} from './model.js?v=2';

const contentKey=block=>JSON.stringify({type:block.type,runs:block.runs,dual:block.dual});
const detailKey=block=>JSON.stringify(sceneDetails(block.outline));

/** Stable block IDs make comparisons independent of paragraph position. */
export function compareDrafts(previousValue,currentValue) {
    const previous=normalize(previousValue),current=normalize(currentValue);
    const oldById=new Map(previous.blocks.map((block,index)=>[block.id,{block,index}]));
    const matched=new Set(),pairs=[];
    const oldContent=new Map(),newCounts=new Map();
    for(const block of previous.blocks){const key=contentKey(block);const ids=oldContent.get(key)||[];ids.push(block.id);oldContent.set(key,ids);}
    for(const block of current.blocks){const key=contentKey(block);newCounts.set(key,(newCounts.get(key)||0)+1);}
    // Reserve exact IDs before matching imports whose IDs have been regenerated.
    const reserved=new Set(current.blocks.filter(b=>oldById.has(b.id)).map(b=>b.id));
    for(const [index,block] of current.blocks.entries()) {
        let old=oldById.get(block.id);
        if(!old){const key=contentKey(block),ids=oldContent.get(key);if(ids?.length===1&&newCounts.get(key)===1&&!reserved.has(ids[0])&&!matched.has(ids[0]))old=oldById.get(ids[0]);}
        if(old){matched.add(old.block.id);pairs.push({before:old.block,after:block,beforeIndex:old.index,afterIndex:index});}
        else pairs.push({before:null,after:block,beforeIndex:null,afterIndex:index});
    }
    // Longest increasing subsequence: insertion does not make every later
    // paragraph look moved, and a scene reorder can be detected in O(n log n).
    const common=pairs.filter(pair=>pair.before),tails=[],tailIndices=[],parents=[];
    for(let i=0;i<common.length;i++) {
        const value=common[i].beforeIndex;let lo=0,hi=tails.length;
        while(lo<hi){const mid=(lo+hi)>>1;if(tails[mid]<value)lo=mid+1;else hi=mid;}
        parents[i]=lo?tailIndices[lo-1]:-1;tails[lo]=value;tailIndices[lo]=i;
    }
    const stable=new Set();let cursor=tailIndices.at(-1);
    while(cursor!==undefined&&cursor>=0){stable.add(common[cursor].after.id);cursor=parents[cursor];}
    const changes=pairs.map(pair=>({...pair,kind:!pair.before?'added':contentKey(pair.before)!==contentKey(pair.after)?'changed':detailKey(pair.before)!==detailKey(pair.after)?'outline':'unchanged',outlineChanged:!!pair.before&&detailKey(pair.before)!==detailKey(pair.after),moved:!!pair.before&&!stable.has(pair.after.id)}));
    for(const [index,block] of previous.blocks.entries())if(!matched.has(block.id))changes.push({before:block,after:null,beforeIndex:index,afterIndex:null,kind:'removed',moved:false});
    const metadata=['title','author','credit','contact','draft','paper','titlePage'].filter(field=>previous[field]!==current[field]).map(field=>({field,before:previous[field],after:current[field]}));
    const counts={added:0,removed:0,changed:0,outline:0,moved:0};
    for(const change of changes){if(change.kind in counts&&change.kind!=='outline')counts[change.kind]++;if(change.outlineChanged)counts.outline++;if(change.moved)counts.moved++;}
    return {previous,current,changes,metadata,counts};
}

/** Word-level highlighting with a bounded matrix; huge paragraphs fall back
 * to a common prefix/suffix rather than blocking the editor. */
export function diffWords(before,after) {
    const tokenize=value=>String(value).match(/\s+|[^\s]+/gu)||[];
    const a=tokenize(before),b=tokenize(after),result=[];
    const push=(kind,text)=>{if(!text)return;const last=result.at(-1);if(last?.kind===kind)last.text+=text;else result.push({kind,text});};
    let start=0;while(start<a.length&&start<b.length&&a[start]===b[start])start++;
    let ae=a.length,be=b.length;while(ae>start&&be>start&&a[ae-1]===b[be-1]){ae--;be--;}
    push('same',a.slice(0,start).join(''));
    const left=a.slice(start,ae),right=b.slice(start,be);
    if(left.length*right.length>160000){push('removed',left.join(''));push('added',right.join(''));}
    else {
        const rows=Array.from({length:left.length+1},()=>new Uint16Array(right.length+1));
        for(let i=left.length-1;i>=0;i--)for(let j=right.length-1;j>=0;j--)rows[i][j]=left[i]===right[j]?rows[i+1][j+1]+1:Math.max(rows[i+1][j],rows[i][j+1]);
        let i=0,j=0;
        while(i<left.length||j<right.length){if(i<left.length&&j<right.length&&left[i]===right[j]){push('same',left[i]);i++;j++;}else if(i<left.length&&(j===right.length||rows[i+1][j]>=rows[i][j+1]))push('removed',left[i++]);else push('added',right[j++]);}
    }
    push('same',a.slice(ae).join(''));return result;
}

export const changedText=change=>diffWords(change.before?textOf(change.before):'',change.after?textOf(change.after):'');
