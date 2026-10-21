/** Checked collaborator RPCs. No browser SDK or DOM dependency. */
const OPERATIONS=["list_book_collaborators","create_book_editor_invite","accept_book_editor_invite","revoke_book_editor","list_editable_books"];
export function isBookEditorsSchemaMissing(error) {
    const message=String(error?.message || error || "");
    return ["PGRST202","PGRST205","42P01","42883"].includes(error?.code)
        || OPERATIONS.some(name=>message.includes(name)) && /does not exist|schema cache|could not find/i.test(message);
}
export function bookEditorsError(error) {
    if(isBookEditorsSchemaMissing(error))return new Error("Editor invitations are temporarily unavailable. The site owner needs to finish the collaboration setup.");
    const text=String(error?.message || error || "");
    if(/infinite recursion/i.test(text))return new Error("Collaboration permissions need a site update. Please contact the site owner.");
    if(["42501"].includes(error?.code))return new Error("Your account does not have permission for this collaborator action.");
    if(/failed to fetch|network|fetch dynamically imported|importing a module/i.test(text))return new Error("Could not connect to editor invitations. Check your connection and try again.");
    return new Error(text || "Could not complete this collaborator action. Please try again.");
}
export function bookInviteUrl(token,origin="") {
    if(!/^[a-f0-9]{48,64}$/.test(String(token || "")))throw new Error("Could not confirm the invite link. Please try again.");
    return origin+"/book-invite#token="+encodeURIComponent(token);
}
function normalizePerson(row){
    return row ? {userId:row.user_id || "",displayName:row.display_name || (row.role==="owner"?"Owner":"Editor"),role:row.role,isYou:Boolean(row.is_you)} : null;
}
export function createBookEditorsApi(client,{origin=""}={}) {
    async function rpc(name,args){const {data,error}=await client.rpc(name,args);if(error)throw bookEditorsError(error);return data;}
    return {
        async listBookCollaborators(bookId){
            const data=await rpc("list_book_collaborators",{p_book_id:bookId});
            if(!data?.owner?.user_id || !Array.isArray(data.editors) || typeof data.is_owner!=="boolean")throw new Error("Could not confirm this book’s collaborator permissions. Try again.");
            return {owner:normalizePerson(data.owner),editors:data.editors.map(normalizePerson),isOwner:data.is_owner};
        },
        async createBookEditorInvite(bookId,email=""){
            const data=await rpc("create_book_editor_invite",{p_book_id:bookId,p_email:String(email||"").trim()});
            const token=String(data?.token||"");return {token,url:bookInviteUrl(token,origin),expiresAt:data.expires_at||""};
        },
        async acceptBookEditorInvite(token){
            if(!/^[a-f0-9]{48,64}$/.test(String(token||"")))throw new Error("This invite link is invalid.");
            const data=await rpc("accept_book_editor_invite",{p_token:token});
            if(!data?.book_id)throw new Error("Could not confirm access to the book. Try accepting the link again.");
            return {bookId:String(data.book_id)};
        },
        async revokeBookEditor(bookId,userId){
            const data=await rpc("revoke_book_editor",{p_book_id:bookId,p_user_id:userId});
            if(data?.ok!==true)throw new Error("Could not confirm the editor was removed. Try again.");
        },
    };
}

