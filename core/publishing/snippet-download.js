/** Prepare only the generated PNG as a short-lived attachment on the site's origin. */
export function createSnippetDownloadApi(supabase, { origin, getBook, fetcher = fetch }) {
    return {
        async prepare(file) {
            const book = getBook?.();
            if (String(book?.title || '').trim().toLowerCase() !== 'archangel' || !book?.id) throw new Error('Direct PNG downloads are currently being tested only with Archangel.');
            const { data, error } = await supabase.auth.getSession();
            if (error || !data?.session?.access_token) throw new Error('Sign in again to prepare the PNG download.');
            const response = await fetcher(new URL('/api/snippet-download', origin), {
                method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'image/png', 'X-File-Name': file.name, 'X-Book-ID': String(book.id) }, body: file
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not prepare the PNG download. Try again.');
            const url = new URL(result.url, origin);
            if (url.origin !== new URL(origin).origin || url.pathname !== '/api/snippet-download' || !/^[a-f0-9]{48}$/.test(url.searchParams.get('token') || '') || !(result.expiresAt > Date.now())) throw new Error('The download response was invalid. Try again.');
            return { url: url.href, expiresAt: result.expiresAt };
        }
    };
}
