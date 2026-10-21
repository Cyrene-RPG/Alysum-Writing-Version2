export const CONNECTION_PAGE_SIZE=50;
export const CONNECTION_KINDS=Object.freeze({following:"Following",subscriptions:"Book subscriptions",followers:"Followers"});
function check(error) {
    if(!error)return;
    if(["42P01","PGRST202","PGRST205"].includes(error.code))throw new Error("Your connection lists are not available yet. Please try again later.");
    throw new Error(error.message || "Could not load your connections.");
}
export async function getConnectionsSummary(client) {
    const {data,error}=await client.rpc("get_my_connections_summary");check(error);
    return {following:Number(data?.following)||0,followers:Number(data?.followers)||0,subscriptions:Number(data?.subscriptions)||0};
}
export async function listConnections(client,{kind="following",afterId="",limit=CONNECTION_PAGE_SIZE}={}) {
    if(!Object.hasOwn(CONNECTION_KINDS,kind))throw new Error("Choose a connections list.");
    const {data,error}=await client.rpc("list_my_connections",{p_kind:kind,p_after_id:String(afterId),p_limit:Math.max(1,Math.min(100,Number(limit)||CONNECTION_PAGE_SIZE))});
    check(error);
    return (data||[]).map(row=>({
        id:String(row.connection_id),displayName:String(row.display_name || (kind==="subscriptions"?"Book":"Reader")),
        username:String(row.username||""),imageUrl:String(row.image_url||""),
        authorId:row.author_id||"",bookId:row.book_id||"",createdAt:row.created_at,available:row.available!==false,
    }));
}

export async function removeConnection(client,{kind,id,userId}) {
    if(!["following","subscriptions"].includes(kind) || !id || !userId)throw new Error("Choose a connection from your own account.");
    const {data,error}=await client.rpc("remove_my_connection",{p_kind:kind,p_target_id:String(id),p_expected_user_id:userId});
    check(error);
    if(data!==true)throw new Error("Could not confirm the change. Please refresh.");
}
