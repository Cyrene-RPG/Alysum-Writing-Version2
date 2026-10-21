import {supabase} from "/core/authentication/client.js";
import {isDesktopLocalHost} from "/core/desktop/app.js";
import {getConnectionsSummary,listConnections,removeConnection} from "/core/account/connections.js";
import {mountConnections} from "./page.js";
const page=mountConnections({api:{
    summary:()=>getConnectionsSummary(supabase),
    list:options=>listConnections(supabase,options),
    remove:options=>removeConnection(supabase,options),
}});
let epoch=0;
supabase.auth.onAuthStateChange((event,session)=>{epoch++;page.setViewer(isDesktopLocalHost()?"":session?.user?.id||"");});
const request=epoch;
void supabase.auth.getSession().then(({data,error})=>{
    if(request===epoch)page.setViewer(error||isDesktopLocalHost()?"":data?.session?.user?.id||"");
}).catch(()=>{if(request===epoch)page.setViewer("");});
window.addEventListener("hashchange",()=>page.setKind(location.hash.slice(1)));
window.addEventListener("pageshow",event=>{if(event.persisted)window.location.reload();});
