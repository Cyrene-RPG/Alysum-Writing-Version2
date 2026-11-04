/** Personal writing atmosphere. Alysum never hosts or plays copyrighted songs. */
export const SOUND_STORAGE_KEY = 'alysum:editor:sound';
export const DEFAULT_SOUND_VOLUME = 0.4;
export const ATMOSPHERE_MEDIA_BASE = '/core/atmosphere/media';
export const ATMOSPHERE_BEDS = Object.freeze([
    { id: 'rain', label: 'Rain', description: 'Soft rain' },
    { id: 'cafe', label: 'Cafe', description: 'Quiet room tone' },
    { id: 'night', label: 'Night', description: 'Night air' },
    { id: 'fire', label: 'Fire', description: 'Low fire' },
]);
const LOOP_EXTENSIONS = Object.freeze(['ogg', 'mp3', 'wav']);
const SONG_HOSTS = new Set([
    'open.spotify.com',
    'play.spotify.com',
    'music.youtube.com',
    'www.youtube.com',
    'youtube.com',
    'm.youtube.com',
    'youtu.be',
    'music.apple.com',
]);

export function atmosphereBed(id) {
    return ATMOSPHERE_BEDS.find((bed) => bed.id === id) || null;
}

export function atmosphereLoopUrls(id) {
    const bed = atmosphereBed(id);
    if (!bed) return [];
    return LOOP_EXTENSIONS.map((extension) => `${ATMOSPHERE_MEDIA_BASE}/${bed.id}.${extension}`);
}

function clampVolume(value) {
    const volume = Number(value);
    if (!Number.isFinite(volume)) return DEFAULT_SOUND_VOLUME;
    return Math.min(1, Math.max(0, volume));
}

/** Spotify / YouTube / Apple Music HTTPS links only. Alysum never fetches the audio. */
export function normalizeSongUrl(raw) {
    const value = String(raw ?? '').trim();
    if (!value || value.length > 2000) return '';
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return '';
        if (!SONG_HOSTS.has(url.hostname.toLowerCase())) return '';
        return url.href;
    } catch {
        return '';
    }
}

export function songProviderLabel(raw) {
    const href = normalizeSongUrl(raw);
    if (!href) return '';
    const host = new URL(href).hostname.toLowerCase();
    if (host.includes('spotify')) return 'Spotify';
    if (host.includes('apple')) return 'Apple Music';
    return 'YouTube';
}

export function readSoundPrefs(raw) {
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const bed = atmosphereBed(value.bed)?.id || '';
    return {
        bed,
        volume: clampVolume(value.volume),
        muted: value.muted === true,
        songUrl: normalizeSongUrl(value.songUrl),
    };
}

export function soundButtonLabel(prefs, playing) {
    const bed = atmosphereBed(prefs?.bed);
    if (playing && bed) return `Sound · ${bed.label}`;
    return 'Sound';
}

export function soundChipLabel(prefs, playing) {
    const bed = atmosphereBed(prefs?.bed);
    if (!bed) return 'Sound';
    if (prefs?.muted) return `${bed.label} · muted`;
    if (playing) return bed.label;
    return `${bed.label} · paused`;
}

export function missingLoopMessage(id) {
    const bed = atmosphereBed(id);
    const name = bed?.label || 'That sound';
    const file = bed ? `${bed.id}.ogg` : 'rain.ogg';
    return `${name} is not installed yet. Add a royalty-free loop as ${file}.`;
}
