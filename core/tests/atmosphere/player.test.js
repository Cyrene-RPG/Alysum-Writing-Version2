import test from 'node:test';
import assert from 'node:assert/strict';
import { createAtmospherePlayer } from '../../atmosphere/player.js';

function fakeContext() {
    function param(value = 0) {
        return {
            value,
            setValueAtTime(next) { this.value = next; },
            exponentialRampToValueAtTime(next) { this.value = next; },
        };
    }
    function node(extra = {}) {
        return {
            connect() { return this; },
            disconnect() {},
            start() {},
            stop() {},
            gain: param(1),
            buffer: null,
            loop: false,
            ...extra,
        };
    }
    return {
        sampleRate: 8000,
        currentTime: 0,
        destination: {},
        state: 'running',
        async resume() { this.state = 'running'; },
        createGain() { return node(); },
        createBufferSource() { return node(); },
        createBuffer(channels, length, rate) {
            return {
                numberOfChannels: channels,
                length,
                sampleRate: rate,
                getChannelData: () => new Float32Array(length),
            };
        },
    };
}

test('rain starts from a royalty-free loop file and mute silences without changing the bed', async () => {
    const context = fakeContext();
    const loaded = [];
    const player = createAtmospherePlayer({
        createContext: () => context,
        async loadLoop(next, id) {
            loaded.push(id);
            return next.createBuffer(1, 8, next.sampleRate);
        },
    });
    const started = await player.play('rain');
    assert.deepEqual(loaded, ['rain']);
    assert.equal(started.bed, 'rain');
    assert.equal(started.playing, true);
    assert.equal(started.muted, false);
    const muted = player.setMuted(true);
    assert.equal(muted.muted, true);
    assert.equal(muted.playing, true);
    assert.equal(muted.bed, 'rain');
    player.destroy();
});

test('missing loops and unknown beds do not invent a song source', async () => {
    const player = createAtmospherePlayer({
        createContext: () => fakeContext(),
        async loadLoop() { return null; },
    });
    await assert.rejects(() => player.play('spotify'), /rain, cafe, night, or fire/);
    await assert.rejects(() => player.play('cafe'), /cafe\.ogg/);
    const ready = createAtmospherePlayer({
        createContext: () => fakeContext(),
        async loadLoop(next) { return next.createBuffer(1, 8, next.sampleRate); },
    });
    await ready.play('cafe');
    const paused = ready.pause();
    assert.equal(paused.playing, false);
    assert.equal(paused.bed, 'cafe');
    ready.setVolume(0.2);
    assert.equal(ready.getState().volume, 0.2);
    ready.destroy();
    player.destroy();
});
