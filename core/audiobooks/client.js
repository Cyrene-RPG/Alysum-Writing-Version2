import {AUDIO_BUCKET, audiobookDetails, inspectAudioFile, audioError} from './model.js';

/** Private author drafts. Public listening/publishing is intentionally separate. */
export function createAudiobooksApi(client, userId) {
    function requireAccount() { if (!client || !userId) throw new Error('Sign in online to create and upload audiobooks.'); }
    async function rpc(name, args) {
        requireAccount();
        const {data,error} = await client.rpc(name,args);
        if (error) throw audioError(error);
        return data;
    }
    async function query(builder) {
        const {data,error} = await builder;
        if (error) throw audioError(error);
        return data;
    }
    const api = {
        async list() {
            requireAccount();
            return await query(client.from('audiobooks').select('*').eq('owner_id',userId).order('updated_at',{ascending:false})) || [];
        },
        async get(id) {
            requireAccount();
            const book = await query(client.from('audiobooks').select('*').eq('id',id).eq('owner_id',userId).maybeSingle());
            if (!book) throw new Error('This audiobook is not available to your account.');
            return book;
        },
        async tracks(id) {
            requireAccount();
            return await query(client.from('audiobook_tracks').select('*').eq('audiobook_id',id).order('position')) || [];
        },
        async save(id, details) {
            const book = await rpc('save_audiobook',{p_id:id || null,p_details:audiobookDetails(details)});
            if (!book?.id) throw new Error('Could not confirm the audiobook was saved. Reload before retrying.');
            return book;
        },
        async upload(id, file, {title,duration}) {
            requireAccount();
            const info = await inspectAudioFile(file);
            if (!String(title || '').trim() || String(title).length > 200) throw new Error('Name this recording using 1–200 characters.');
            if (!(Number(duration)>0 && Number(duration)<=86400)) throw new Error('Could not read the recording length. Try exporting the audio again.');
            const book = await api.get(id);
            if (!book.rights_confirmed) throw new Error('Confirm your permission to share these recordings and save the details first.');
            const path = `${userId}/${id}/${crypto.randomUUID()}.${info.extension}`;
            const storage = client.storage.from(AUDIO_BUCKET);
            const {error} = await storage.upload(path,file,{contentType:info.contentType,upsert:false,cacheControl:'3600'});
            if (error) throw audioError(error);
            try {
                const track = await rpc('add_audiobook_track',{p_audiobook_id:id,p_details:{storage_path:path,title:String(title).trim(),duration_seconds:Number(duration),size_bytes:file.size}});
                if (!track?.id) throw new Error('Could not confirm the recording was saved.');
                return track;
            } catch (failure) {
                // A lost response can follow a committed insert. Never delete that file.
                let rows;
                try { rows = await api.tracks(id); }
                catch { throw new Error('The file uploaded, but its saved status is uncertain. Reload this audiobook before uploading it again.'); }
                const saved = rows.find(row=>row.storage_path===path);
                if (saved) return saved;
                const cleanup = await storage.remove([path]);
                if (cleanup.error) throw new Error(`${audioError(failure).message} The unused upload could not be cleaned up; contact the site owner.`);
                throw audioError(failure);
            }
        },
        async preview(track) {
            requireAccount();
            const {data,error} = await client.storage.from(AUDIO_BUCKET).createSignedUrl(track.storage_path,21600);
            if (error) throw audioError(error);
            if (!data?.signedUrl) throw new Error('Could not open this recording. Try again.');
            return data.signedUrl;
        },
        async removeTrack(id) {
            const removed = await rpc('remove_audiobook_track',{p_id:id});
            if (!removed?.storage_path) throw new Error('Could not confirm removal. Reload this audiobook.');
            const {error} = await client.storage.from(AUDIO_BUCKET).remove([removed.storage_path]);
            return {cleanupFailed:Boolean(error)};
        },
    };
    return api;
}
