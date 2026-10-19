/** Confirm the public profile write before the settings screen reports success. */
export async function saveAuthorSupportLinks(supabase, userId, links) {
    if (!userId) throw Error('Sign in to save your support links.');
    const {data,error}=await supabase.from('users').update({support_links:links}).eq('id',userId).select('id');
    if (error) throw Error(error.message || 'Could not save your support links.');
    if (!data?.some(row=>String(row.id)===String(userId))) throw Error('Your support links were not saved to your public profile. Please try again.');
    return links;
}
