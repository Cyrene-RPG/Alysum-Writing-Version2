import {supabase} from "/core/authentication/client.js";
import {fetchAuthorById,fetchAuthorByUsername,fetchPublishedWorksForAuthor,supportLinksList} from "/core/library/author-profile.js";
import {fetchFollowState,setFollowing} from "/core/library/author-follow.js";
import {isDesktopLocalHost} from "/core/desktop/app.js";
import {mountAuthorProfile} from "./author.js";
const params=new URLSearchParams(window.location.search);
const page=mountAuthorProfile({api:{
    async getProfile(){
        const id=params.get("id"),username=params.get("u");
        if(!id && !username)return null;
        const value=id ? await fetchAuthorById(supabase,id) : await fetchAuthorByUsername(supabase,username);
        return value ? {...value,links:supportLinksList(value.supportLinks)} : null;
    },
    getWorks:id=>fetchPublishedWorksForAuthor(supabase,id),
    getFollow:(authorId,viewerId)=>fetchFollowState(supabase,{authorId,viewerId}),
    setFollow:(authorId,viewerId,follow)=>setFollowing(supabase,{authorId,viewerId,follow}),
}});
let authVersion=0;
supabase.auth.onAuthStateChange((event,session)=>{
    authVersion++;page.setViewer(isDesktopLocalHost() ? "" : session?.user?.id || "");
});
const version=authVersion;
void supabase.auth.getSession().then(({data,error})=>{
    if(version===authVersion)page.setViewer(error || isDesktopLocalHost() ? "" : data?.session?.user?.id || "");
}).catch(()=>{if(version===authVersion)page.setViewer("");});
void page.load();
window.addEventListener("pageshow",event=>{if(event.persisted)window.location.reload();});
