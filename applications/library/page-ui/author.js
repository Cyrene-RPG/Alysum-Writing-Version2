/** Public author profile view. Only allowlisted public facts are rendered. */
export function mountAuthorProfile({api, root = document, location = window.location}) {
    const el=id=>root.getElementById(id);
    let profile=null, viewerId="", authReady=false, profileEpoch=0, followEpoch=0;
    let following=false, followLoaded=false, saving=false;
    const status=el("author-status"), button=el("author-follow");
    function drawFollow() {
        button.hidden=Boolean(profile && viewerId===profile.id);
        el("author-edit").hidden=!profile || viewerId!==profile.id;
        button.disabled=!profile || !authReady || saving;
        button.textContent=!followLoaded && viewerId ? "Retry follow status" : following ? "Following" : "Follow";
        button.setAttribute("aria-pressed",String(following));
    }
    async function refreshFollow() {
        const request=++followEpoch, author=profile?.id, viewer=viewerId;
        following=false;followLoaded=!viewer;saving=Boolean(viewer && author && viewer!==author);
        drawFollow();
        if (!viewer || !author || viewer===author) { saving=false;drawFollow();return; }
        try {
            const state=await api.getFollow(author,viewer);
            if(request!==followEpoch || viewer!==viewerId || author!==profile?.id)return;
            following=state.following;followLoaded=true;
            el("author-follow-status").textContent="";
        } catch(error) {
            if(request===followEpoch) el("author-follow-status").textContent=error.message || "Could not load follow status.";
        } finally { if(request===followEpoch){saving=false;drawFollow();} }
    }
    function setViewer(id) {
        viewerId=String(id || "");authReady=true;followEpoch++;
        following=false;followLoaded=false;saving=false;
        el("author-follow-status").textContent="";
        saving=Boolean(profile && viewerId && viewerId!==profile.id);drawFollow();
        const epoch=followEpoch;setTimeout(()=>{if(epoch===followEpoch)void refreshFollow();},0);
    }
    function renderProfile(value) {
        el("author-name").textContent=value.displayName || value.username;
        el("author-handle").textContent=value.username ? "@"+value.username : "";
        el("author-bio").textContent=value.bio || "This author hasn’t added a bio yet.";
        el("author-initial").textContent=(value.displayName || value.username || "A").trim().charAt(0).toUpperCase();
        const image=el("author-image"),wrap=el("author-avatar");
        wrap.classList.add("has-initial");
        image.removeAttribute("src");
        if (/^https?:\/\//i.test(value.profileImageUrl || "")) {
            image.onload=()=>wrap.classList.remove("has-initial");
            image.onerror=()=>{image.removeAttribute("src");wrap.classList.add("has-initial");};
            image.src=value.profileImageUrl;
        }
        const links=el("author-links");links.replaceChildren();
        for(const item of value.links || []) {
            const li=root.createElement("li"),a=root.createElement("a");
            a.href=item.url;a.textContent=item.label;a.target="_blank";a.rel="noopener noreferrer";
            li.append(a);links.append(li);
        }
        el("author-links-block").hidden=!links.children.length;
        el("author-updates").href="/updates?author="+encodeURIComponent(value.id);
        el("author-sheet").hidden=false;
        root.title=(value.displayName || value.username)+" — Alysum";
        void refreshFollow();
    }
    async function load() {
        const request=++profileEpoch;followEpoch++;
        profile=null;el("author-sheet").hidden=true;el("author-retry").hidden=true;
        status.textContent="Loading author profile…";drawFollow();
        try {
            const value=await api.getProfile();
            if(request!==profileEpoch)return;
            if(!value) {status.textContent="This author profile is unavailable.";return;}
            profile=value;renderProfile(value);status.textContent="";
            el("author-books-status").textContent="Loading published books…";
            el("author-books").replaceChildren();
            try {
                const books=await api.getWorks(value.id);
                if(request!==profileEpoch)return;
                for(const book of books) {
                    const article=root.createElement("article");article.className="ov-book";
                    const link=root.createElement("a");link.href="/book?id="+encodeURIComponent(book.id);
                    const cover=root.createElement("div");cover.className="ov-cover";
                    if(/^https?:\/\//i.test(book.coverUrl || "")) {
                        const image=root.createElement("img");image.src=book.coverUrl;image.alt="";image.loading="lazy";cover.append(image);
                    } else cover.textContent=book.title;
                    const title=root.createElement("h3");title.className="ov-book-title";title.textContent=book.title;
                    const count=root.createElement("p");count.className="ov-book-author";
                    count.textContent=book.chapterProgressLabel || ((book.publishedChapterCount || 0)+" chapters");
                    link.append(cover,title);article.append(link,count);el("author-books").append(article);
                }
                el("author-books-status").textContent=books.length ? "" : "No published books yet.";
                el("author-book-count").textContent=books.length+" published "+(books.length===1 ? "book" : "books");
            } catch(error) {if(request===profileEpoch)el("author-books-status").textContent=error.message || "Could not load published books. Refresh to try again.";}
        } catch(error) {
            if(request!==profileEpoch)return;
            status.textContent=error.message || "Could not load this author.";
            el("author-retry").hidden=false;
        }
    }
    button.addEventListener("click",async()=>{
        if(saving || !profile || !authReady)return;
        if(!viewerId){location.assign("/login?next="+encodeURIComponent(location.pathname+location.search));return;}
        if(!followLoaded){await refreshFollow();return;}
        const request=++followEpoch,viewer=viewerId,author=profile.id;
        saving=true;drawFollow();el("author-follow-status").textContent="";
        try {
            const result=await api.setFollow(author,viewer,!following);
            if(request!==followEpoch || viewer!==viewerId)return;
            following=result.following;followLoaded=true;
            el("author-follow-status").textContent=following ? "You’re now following this author." : "You’re no longer following this author.";
        } catch(error) {
            if(request===followEpoch){followLoaded=false;el("author-follow-status").textContent=error.message || "Could not save your follow.";}
        } finally {if(request===followEpoch){saving=false;drawFollow();}}
    });
    el("author-retry").addEventListener("click",()=>void load());
    drawFollow();
    return {load,setViewer};
}
