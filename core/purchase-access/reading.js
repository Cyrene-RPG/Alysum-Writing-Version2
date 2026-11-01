/** Merge owned pass snapshots into the existing Library reader, without public text writes. */
export async function readPurchasePassBook(client,bookId,fetcher=fetch){
 if(!client?.auth?.getSession)return [];
 const {data}=await client.auth.getSession();if(!data.session?.access_token||!data.session.user?.id)return [];const identity=data.session.user.id;
 const response=await fetcher('/api/purchase-passes?action=book-read&book='+encodeURIComponent(bookId),{cache:'no-store',credentials:'same-origin',headers:{Authorization:'Bearer '+data.session.access_token}});
 if(!response.ok)throw Error('Could not check Purchase Pass access.');
 const value=await response.json();if((await client.auth.getSession()).data.session?.user?.id!==identity)throw Error('Your account changed.');return Array.isArray(value.chapters)?value.chapters:[];
}
