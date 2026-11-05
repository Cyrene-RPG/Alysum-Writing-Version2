/** Editor sound links. Alysum never hosts or plays copyrighted files. */
export const SOUND_STORAGE_KEY = 'alysum:editor:sound';
export const SOUND_LINKS_MAX = 50;
export const SOUND_FIELD_MAX = 8000;
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

/** One pasted field may hold a playlist, a Mix, or several video links. */
export function parseSongLinks(raw) {
    const text = String(raw ?? '');
    if (!text.trim() || text.length > SOUND_FIELD_MAX) return [];
    const links = [];
    const seen = new Set();
    for (const token of text.split(/[\s,]+/)) {
        const href = normalizeSongUrl(token);
        if (!href || seen.has(href)) continue;
        seen.add(href);
        links.push(href);
        if (links.length >= SOUND_LINKS_MAX) break;
    }
    return links;
}

export function songProviderLabel(raw) {
    const links = parseSongLinks(raw);
    if (!links.length) return '';
    if (links.some((href) => youtubeHost(new URL(href)))) return 'YouTube';
    const host = new URL(links[0]).hostname.toLowerCase();
    if (host.includes('spotify')) return 'Spotify';
    if (host.includes('apple')) return 'Apple Music';
    return 'YouTube';
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_LIST = /^[A-Za-z0-9_-]{10,80}$/;

function youtubeHost(url) {
    const host = url.hostname.toLowerCase();
    return host === 'youtu.be' || host.endsWith('youtube.com');
}

function startSeconds(url) {
    const raw = String(url.searchParams.get('t') || url.searchParams.get('start') || '').trim();
    if (!raw) return 0;
    if (/^\d+$/.test(raw)) return Math.min(86400, Number(raw));
    const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
    if (!match || !match[0]) return 0;
    const seconds = (Number(match[1]) || 0) * 3600 + (Number(match[2]) || 0) * 60 + (Number(match[3]) || 0);
    return Math.min(86400, seconds);
}

function youtubeListId(href) {
    const url = new URL(href);
    if (!youtubeHost(url)) return '';
    const list = url.searchParams.get('list');
    return YOUTUBE_LIST.test(list || '') ? list : '';
}

/** Official in-page player only. Never use the pasted URL as an iframe address. */
export function youtubeVideoId(raw) {
    const href = normalizeSongUrl(raw);
    if (!href) return '';
    const url = new URL(href);
    if (!youtubeHost(url)) return '';
    if (url.hostname.toLowerCase() === 'youtu.be') {
        const id = url.pathname.split('/').filter(Boolean)[0] || '';
        return YOUTUBE_ID.test(id) ? id : '';
    }
    const queryId = url.searchParams.get('v');
    if (YOUTUBE_ID.test(queryId || '')) return queryId;
    const parts = url.pathname.split('/').filter(Boolean);
    for (const key of ['embed', 'shorts', 'live', 'v']) {
        const index = parts.indexOf(key);
        if (index >= 0 && YOUTUBE_ID.test(parts[index + 1] || '')) return parts[index + 1];
    }
    return '';
}

export function youtubeVideoIds(raw) {
    const ids = [];
    const seen = new Set();
    for (const href of parseSongLinks(raw)) {
        const id = youtubeVideoId(href);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
    }
    return ids;
}

export function youtubeEmbedUrl(raw) {
    const links = parseSongLinks(raw);
    if (!links.length) return '';
    const playlistLink = links.find((href) => youtubeListId(href));
    if (playlistLink) {
        const url = new URL(playlistLink);
        const id = youtubeVideoId(playlistLink);
        const embed = new URL(`https://www.youtube-nocookie.com/embed/${id || 'videoseries'}`);
        embed.searchParams.set('list', youtubeListId(playlistLink));
        embed.searchParams.set('rel', '0');
        embed.searchParams.set('playsinline', '1');
        const start = startSeconds(url);
        if (start) embed.searchParams.set('start', String(start));
        return embed.href;
    }
    const ids = youtubeVideoIds(raw);
    if (!ids.length) return '';
    const embed = new URL(`https://www.youtube-nocookie.com/embed/${ids[0]}`);
    if (ids.length > 1) embed.searchParams.set('playlist', ids.slice(1).join(','));
    embed.searchParams.set('rel', '0');
    embed.searchParams.set('playsinline', '1');
    const start = startSeconds(new URL(links[0]));
    if (ids.length === 1 && start) embed.searchParams.set('start', String(start));
    return embed.href;
}

export function readSoundPrefs(raw) {
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return { songUrl: parseSongLinks(value.songUrl).join('\n') };
}
