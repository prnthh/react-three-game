import test from 'node:test';
import assert from 'node:assert/strict';
import { speakDialogue } from '../app/demo/stage/components/speech.ts';

test('speech remains optional on the server and unsupported browsers', () => {
    assert.equal(speakDialogue('Hello'), undefined);
    globalThis.window = {};
    try { assert.equal(speakDialogue('Hello'), undefined); }
    finally { delete globalThis.window; }
});

test('new dialogue replaces speech and disposal cancels the active line', () => {
    const calls = [];
    globalThis.window = {
        SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
        speechSynthesis: {
            cancel: () => calls.push('cancel'),
            speak: utterance => calls.push([utterance.text, utterance.lang]),
        },
    };
    try {
        const stop = speakDialogue('First page');
        stop(); // Effect cleanup on advance, mute or unmount.
        const stopNext = speakDialogue('Next page');
        stopNext();
        assert.deepEqual(calls, ['cancel', ['First page', 'en-US'], 'cancel', 'cancel', ['Next page', 'en-US'], 'cancel']);
        assert.equal(speakDialogue('  '), undefined);
        window.speechSynthesis.speak = () => { throw new Error('No speech service'); };
        assert.doesNotThrow(() => speakDialogue('Still readable')());
    } finally { delete globalThis.window; }
});
