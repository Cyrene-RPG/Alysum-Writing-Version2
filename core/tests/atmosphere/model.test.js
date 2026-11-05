import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SOUND_STORAGE_KEY,
    parseSongLinks,
    normalizeSongUrl,
    readSoundPrefs,
    songProviderLabel,
    youtubeEmbedUrl,
    youtubeVideoId,
    youtubeVideoIds,
} from '../../atmosphere/model.js';

test('favorite songs must be complete HTTPS player links without credentials', () => {
    assert.equal(SOUND_STORAGE_KEY, 'alysum:editor:sound');
    for (const unsafe of [
        'javascript:alert(1)',
        'http://open.spotify.com/track/1',
        'https://user:pass@open.spotify.com/track/1',
        'https://evil.example/track',
        'https://open.spotify.com/' + 'x'.repeat(2000),
        'not a link',
        '',
    ]) assert.equal(normalizeSongUrl(unsafe), '');
    assert.equal(
        normalizeSongUrl(' https://open.spotify.com/track/abc123?si=1 '),
        'https://open.spotify.com/track/abc123?si=1',
    );
    assert.equal(normalizeSongUrl('https://youtu.be/dQw4w9wgGcQ'), 'https://youtu.be/dQw4w9wgGcQ');
    assert.equal(songProviderLabel('https://open.spotify.com/track/abc'), 'Spotify');
    assert.equal(songProviderLabel('https://music.youtube.com/watch?v=abc'), 'YouTube');
    assert.equal(songProviderLabel('https://music.apple.com/us/album/x'), 'Apple Music');
    assert.equal(songProviderLabel('https://example.com/song'), '');
});

test('YouTube links become an official embed and never keep the pasted address', () => {
    assert.equal(youtubeVideoId('https://youtu.be/dQw4w9wgGcQ'), 'dQw4w9wgGcQ');
    assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9wgGcQ&t=90'), 'dQw4w9wgGcQ');
    assert.equal(youtubeVideoId('https://music.youtube.com/watch?v=dQw4w9wgGcQ'), 'dQw4w9wgGcQ');
    assert.equal(youtubeVideoId('https://www.youtube.com/shorts/dQw4w9wgGcQ'), 'dQw4w9wgGcQ');
    assert.equal(youtubeVideoId('https://open.spotify.com/track/abc'), '');
    assert.equal(youtubeVideoId('https://youtu.be/lZdzxqh-rao?si=JlgpfaEfge'), 'lZdzxqh-rao');
    assert.equal(
        youtubeEmbedUrl('https://youtu.be/lZdzxqh-rao?si=JlgpfaEfge'),
        'https://www.youtube-nocookie.com/embed/lZdzxqh-rao?rel=0&playsinline=1&enablejsapi=1',
    );
    assert.equal(
        youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9wgGcQ&t=1m30s'),
        'https://www.youtube-nocookie.com/embed/dQw4w9wgGcQ?start=90&rel=0&playsinline=1&enablejsapi=1',
    );
    assert.equal(youtubeEmbedUrl('javascript:alert(1)'), '');
    assert.equal(youtubeEmbedUrl('https://evil.example/watch?v=dQw4w9wgGcQ'), '');
});

test('several YouTube links or a playlist become one autoplay queue', () => {
    const queue = [
        'https://youtu.be/dQw4w9wgGcQ',
        'https://youtu.be/lZdzxqh-rao?si=JlgpfaEfge',
    ].join('\n');
    assert.deepEqual(parseSongLinks(queue), [
        'https://youtu.be/dQw4w9wgGcQ',
        'https://youtu.be/lZdzxqh-rao?si=JlgpfaEfge',
    ]);
    assert.deepEqual(youtubeVideoIds(queue), ['dQw4w9wgGcQ', 'lZdzxqh-rao']);
    assert.equal(
        youtubeEmbedUrl(queue),
        'https://www.youtube-nocookie.com/embed/dQw4w9wgGcQ?playlist=dQw4w9wgGcQ%2ClZdzxqh-rao&index=0&rel=0&playsinline=1&enablejsapi=1',
    );
    assert.equal(new URL(youtubeEmbedUrl(queue)).pathname, '/embed/dQw4w9wgGcQ');
    assert.equal(
        youtubeEmbedUrl('https://www.youtube.com/playlist?list=PLabcdefghijkmnopqrs'),
        'https://www.youtube-nocookie.com/embed/videoseries?list=PLabcdefghijkmnopqrs&rel=0&playsinline=1&enablejsapi=1',
    );
    assert.equal(
        youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9wgGcQ&list=RDdQw4w9wgGcQ'),
        'https://www.youtube-nocookie.com/embed/dQw4w9wgGcQ?list=RDdQw4w9wgGcQ&rel=0&playsinline=1&enablejsapi=1',
    );
    assert.equal(songProviderLabel(queue), 'YouTube');
});

test('prefs keep a sanitized song link and ignore leftover rain settings', () => {
    assert.deepEqual(readSoundPrefs(null), { songUrl: '' });
    assert.deepEqual(
        readSoundPrefs({ bed: 'rain', volume: 0.8, muted: true, songUrl: 'https://youtu.be/dQw4w9wgGcQ' }),
        { songUrl: 'https://youtu.be/dQw4w9wgGcQ' },
    );
    assert.equal(readSoundPrefs({ songUrl: 'javascript:alert(1)' }).songUrl, '');
    assert.equal(
        readSoundPrefs({
            songUrl: 'https://youtu.be/dQw4w9wgGcQ\nhttps://youtu.be/lZdzxqh-rao',
        }).songUrl,
        'https://youtu.be/dQw4w9wgGcQ\nhttps://youtu.be/lZdzxqh-rao',
    );
});
