export type PointerToolControls = { enabled: boolean };
export interface PointerToolHandlers {
    /** Prepare a transient edit; false leaves navigation alone. */
    begin(event: PointerEvent): boolean;
    move(event: PointerEvent): void;
    /** Commit once on release, or roll back on cancellation. */
    end(commit: boolean): void;
    hover?(event: PointerEvent): void;
    leave?(): void;
    onError(error: unknown): void;
}
export interface PointerToolOptions {
    controls?: () => PointerToolControls | null;
    /** Default: primary mouse/pen, with Alt reserved for navigation. */
    acceptsPointer?: (event: PointerEvent) => boolean;
    windowTarget?: Window;
}

/** Reusable canvas interaction ownership for brushes, paths, masks and placement tools.
 * Document writes belong in end(true); live preview and rollback stay tool-specific. */
export function attachPointerTool(canvas: HTMLCanvasElement, handlers: PointerToolHandlers, options: PointerToolOptions = {}) {
    const windowTarget = options.windowTarget ?? window;
    let active: { pointer: number; controls: PointerToolControls | null; enabled: boolean } | null = null;
    const block = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    function finish(commit: boolean) {
        if (!active) return;
        const current = active;
        active = null;
        try { handlers.end(commit); }
        catch (error) { handlers.onError(error); }
        finally {
            if (current.controls) current.controls.enabled = current.enabled;
            if (canvas.hasPointerCapture(current.pointer)) canvas.releasePointerCapture(current.pointer);
        }
    }
    const cancel = () => { finish(false); handlers.leave?.(); };
    const fail = (error: unknown) => { cancel(); handlers.onError(error); };
    function down(event: PointerEvent) {
        if (active) { block(event); return; }
        const accepted = options.acceptsPointer?.(event) ?? (event.pointerType !== 'touch' && event.button === 0 && !event.altKey);
        if (!accepted) return;
        try {
            if (!handlers.begin(event)) return;
            block(event);
            const controls = options.controls?.() ?? null;
            active = { pointer: event.pointerId, controls, enabled: controls?.enabled ?? true };
            if (controls) controls.enabled = false;
            canvas.setPointerCapture(event.pointerId);
            handlers.move(event);
        } catch (error) {
            // begin may have prepared state before it threw.
            if (!active) { try { handlers.end(false); } finally { handlers.onError(error); } }
            else fail(error);
        }
    }
    function move(event: PointerEvent) {
        try {
            if (active) {
                block(event);
                if (event.pointerId !== active.pointer) return;
                const samples = event.getCoalescedEvents?.();
                for (const sample of samples?.length ? samples : [event]) handlers.move(sample);
            } else if (event.pointerType !== 'touch' && !event.buttons) handlers.hover?.(event);
            else handlers.leave?.();
        } catch (error) { fail(error); }
    }
    function up(event: PointerEvent) {
        if (active?.pointer !== event.pointerId) return;
        block(event); finish(true);
    }
    function lost(event: PointerEvent) { if (active?.pointer === event.pointerId) cancel(); }
    function key(event: KeyboardEvent) {
        if (event.key === 'Escape') { cancel(); event.preventDefault(); }
        if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) cancel();
    }
    const leave = () => handlers.leave?.();
    canvas.addEventListener('pointerdown', down, { capture: true });
    canvas.addEventListener('pointermove', move, { capture: true });
    canvas.addEventListener('pointerup', up, { capture: true });
    canvas.addEventListener('pointercancel', lost, { capture: true });
    canvas.addEventListener('lostpointercapture', lost, { capture: true });
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('click', block, { capture: true });
    canvas.addEventListener('contextmenu', block);
    windowTarget.addEventListener('keydown', key, { capture: true });
    windowTarget.addEventListener('blur', cancel);
    return {
        cancel,
        dispose() {
            cancel();
            canvas.removeEventListener('pointerdown', down, { capture: true });
            canvas.removeEventListener('pointermove', move, { capture: true });
            canvas.removeEventListener('pointerup', up, { capture: true });
            canvas.removeEventListener('pointercancel', lost, { capture: true });
            canvas.removeEventListener('lostpointercapture', lost, { capture: true });
            canvas.removeEventListener('pointerleave', leave);
            canvas.removeEventListener('click', block, { capture: true });
            canvas.removeEventListener('contextmenu', block);
            windowTarget.removeEventListener('keydown', key, { capture: true });
            windowTarget.removeEventListener('blur', cancel);
        },
    };
}
