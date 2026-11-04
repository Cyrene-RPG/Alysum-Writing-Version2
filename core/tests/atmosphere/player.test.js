import test from 'node:test';
import assert from 'node:assert/strict';
import { createAtmospherePlayer } from '../../atmosphere/player.js';

function fakeContext() {
    const nodes = [];
    function param(value = 0) {
        return {
            value,
            setValueAtTime(next) { this.value = next; },
            exponentialRampToValueAtTime(next) { this.value = next; },
        };
    }
    function node(extra = {}) {
        const created = {
            connect() { return this; },
            disconnect() {},
            start() {},
            stop() {},
            gain: param(1),
            frequency: param(0),
            Q: param(1),
            type: 'lowpass',
            buffer: null,
            loop: false,
            ...extra,
        };
        nodes.push(created);
        return created;
    }
    const context = {
        sampleRate: 8000,
        currentTime: 0,
        destination: {},
        state: 'running',
        nodes,
        async resume() { this.state = 'running'; },
        createGain() { return node(); },
        createBiquadFilter() { return node(); },
        createBufferSource() { return node(); },
        createOscillator() { return node({ type: 'sine' }); },
        createBuffer(channels, length, rate) {
            return {
                numberOfChannels: channels,
                length,
                sampleRate: rate,
                getChannelData: () => new Float32Array(length),
            };
        },
    };
    return context;
}

test('rain starts from a user play call and mute silences without changing the bed', async () => {
    const context = fakeContext();
    const player = createAtmospherePlayer({ createContext: () => context });
    const started = await player.play('rain');
    assert.equal(started.bed, 'rain');
    assert.equal(started.playing, true);
    assert.equal(started.muted, false);
    assert.ok(context.nodes.length > 0);
    const muted = player.setMuted(true);
    assert.equal(muted.muted, true);
    assert.equal(muted.playing, true);
    assert.equal(muted.bed, 'rain');
    player.destroy();
});

test('unknown beds and pause do not invent a song source', async () => {
    const player = createAtmospherePlayer({ createContext: () => fakeContext() });
    await assert.rejects(() => player.play('spotify'), /rain, cafe, night, or fire/);
    await player.play('cafe');
    const paused = player.pause();
    assert.equal(paused.playing, false);
    assert.equal(paused.bed, 'cafe');
    player.setVolume(0.2);
    assert.equal(player.getState().volume, 0.2);
    player.destroy();
});
