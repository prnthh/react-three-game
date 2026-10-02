/** Speech is optional presentation; text and advancing never depend on audio. */
export function speakDialogue(text: string): (() => void) | undefined {
    if (typeof window === "undefined" || !window.speechSynthesis || !window.SpeechSynthesisUtterance || !text.trim()) return;

    const synth = window.speechSynthesis;
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    // The browser chooses an available English voice, including when voices load late.
    synth.cancel();
    try {
        synth.speak(utterance);
    } catch {
        // Devices without a usable speech service still show the dialogue.
    }
    // Page changes, mute, scene changes and unmount all stop the previous line.
    return () => synth.cancel();
}
