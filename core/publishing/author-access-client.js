/** Uses the caller's existing Supabase session; private replies never enter storage. */
export async function authorAccessRequest(supabase, action, {method='GET',body,query={}}={}) {
    const url = new URL('/api/author-access',window.location.origin); url.searchParams.set('action',action);
    for (const [key,value] of Object.entries(query)) url.searchParams.set(key,value);
    const {data} = await supabase.auth.getSession(); const token=data.session?.access_token;
    const response = await fetch(url,{method,cache:'no-store',credentials:'same-origin',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    let result; try { result=await response.json(); } catch { throw Error('Chapter access could not be reached. Try again.'); }
    if (!response.ok) throw Error(result.error || 'Chapter access request failed.');
    return result;
}
