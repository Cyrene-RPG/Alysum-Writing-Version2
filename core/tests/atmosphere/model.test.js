import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ATMOSPHERE_BEDS,
    SOUND_STORAGE_KEY,
    atmosphereBed,
    atmosphereLoopUrls,
    missingLoopMessage,
    normalizeSongUrl,
    readSoundPrefs,
    songProviderLabel,
    soundButtonLabel,
    soundChipLabel,
} from '../../atmosphere/model.js';

test('atmosphere beds are named royalty-free loops, not uploaded songs', () => {
    assert.equal(SOUND_STORAGE_KEY, 'alysum:editor:sound');
    assert.deepEqual(ATMOSPHERE_BEDS.map((bed) => bed.id), ['rain', 'cafe', 'night', 'fire']);
    assert.equal(atmosphereBed('rain').label, 'Rain');
    assert.equal(atmosphereBed('song'), null);
    assert.deepEqual(atmosphereLoopUrls('rain'), [
        '/core/atmosphere/media/rain.ogg',
        '/core/atmosphere/media/rain.mp3',
        '/core/atmosphere/media/rain.wav',
    ]);
    assert.match(missingLoopMessage('rain'), /rain\.ogg/);
});

test('favorite songs must be complete HTTPS player links without credentials', () => {
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

test('prefs keep a bed, volume, mute, and a sanitized song link', () => {
    assert.deepEqual(readSoundPrefs(null), { bed: '', volume: 0.4, muted: false, songUrl: '' });
    assert.deepEqual(
        readSoundPrefs({ bed: 'rain', volume: 0.8, muted: true, songUrl: 'https://open.spotify.com/track/1' }),
        { bed: 'rain', volume: 0.8, muted: true, songUrl: 'https://open.spotify.com/track/1' },
    );
    assert.equal(readSoundPrefs({ bed: 'tape', volume: 9, songUrl: 'javascript:alert(1)' }).bed, '');
    assert.equal(readSoundPrefs({ volume: 9 }).volume, 1);
    assert.equal(readSoundPrefs({ volume: -2 }).volume, 0);
});

test('button and focus-mode labels do not mention hosted music', () => {
    assert.equal(soundButtonLabel({ bed: 'rain' }, false), 'Sound');
    assert.equal(soundButtonLabel({ bed: 'rain' }, true), 'Sound · Rain');
    assert.equal(soundChipLabel({ bed: 'rain', muted: false }, true), 'Rain');
    assert.equal(soundChipLabel({ bed: 'rain', muted: true }, true), 'Rain · muted');
    assert.equal(soundChipLabel({ bed: 'fire', muted: false }, false), 'Fire · paused');
    assert.equal(soundChipLabel({ bed: '' }, false), 'Sound');
});
