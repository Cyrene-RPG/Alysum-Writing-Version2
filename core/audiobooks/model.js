export const AUDIO_BUCKET = 'audiobook-recordings';
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export const AUDIO_ACCEPT = '.mp3,.m4a,.ogg,.wav,.webm';
const TYPES = {mp3:'audio/mpeg',m4a:'audio/mp4',ogg:'audio/ogg',wav:'audio/wav',webm:'audio/webm'};

export function audiobookDetails(value = {}) {
    const clean = (key, max) => {
        const text = String(value[key] || '').trim();
        if (text.length > max) throw new Error(`${key.replaceAll('_', ' ')} must be ${max} characters or fewer.`);
        return text;
    };
    const title = clean('title', 200);
    if (!title) throw new Error('Give the audiobook a title.');
    return {title,description:clean('description',6000),narrator:clean('narrator',200),credits:clean('credits',2000),
        linked_book_id:String(value.linked_book_id || '') || null,rights_confirmed:value.rights_confirmed === true};
}

export function audioFileInfo(file) {
    if (!file || !Number.isFinite(file.size) || file.size <= 0) throw new Error('Choose a recording that is not empty.');
    if (file.size > MAX_AUDIO_BYTES) throw new Error('Each recording must be 50 MB or smaller. Split longer recordings into chapters.');
    const extension = String(file.name || '').split('.').pop().toLowerCase();
    if (!TYPES[extension]) throw new Error('Choose an MP3, M4A, OGG, WAV, or WebM recording.');
    if (file.type && !/^(audio\/|video\/webm$|application\/ogg$|application\/octet-stream$)/i.test(file.type)) throw new Error('Choose an audio recording.');
    return {extension,contentType:TYPES[extension]};
}

export async function inspectAudioFile(file) {
    const info = audioFileInfo(file);
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const text = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));
    const valid = info.extension === 'mp3' ? text(0,3)==='ID3' || bytes[0]===255 && (bytes[1]&224)===224
        : info.extension === 'm4a' ? text(4,4)==='ftyp'
        : info.extension === 'ogg' ? text(0,4)==='OggS'
        : info.extension === 'wav' ? text(0,4)==='RIFF' && text(8,4)==='WAVE'
        : bytes[0]===26 && bytes[1]===69 && bytes[2]===223 && bytes[3]===163;
    if (!valid) throw new Error('This file does not match its audio format. Export the recording again and retry.');
    return info;
}

export function formatAudioDuration(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
    return `${hours ? hours + ':' + String(minutes).padStart(2,'0') : minutes}:${String(seconds % 60).padStart(2,'0')}`;
}

export function audioError(error) {
    const message = String(error?.message || error || 'Could not complete that action. Try again.');
    if (['PGRST202','PGRST205','42P01','42883'].includes(error?.code) || /bucket.*not found|schema cache/i.test(message)) {
        return new Error('Audiobook storage is not ready yet. Your written books are still available.');
    }
    if (/failed to fetch|network/i.test(message)) return new Error('Could not connect. Check your connection and try again.');
    return new Error(message);
}
