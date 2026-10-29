/** Physics-independent collider preparation and residency. The caller supplies distance, shape construction, and body lifecycle. */
export type ColliderResidencyTarget = { id: string; revision: string; distance: number };
export function createColliderResidencyScheduler<Shape>(options: {
    activeLimit: number;
    build: (target: ColliderResidencyTarget) => Promise<Shape>;
    activate: (id: string, shape: Shape) => void;
    deactivate: (id: string) => void;
    report?: (id: string, state: 'queued' | 'building' | 'ready' | 'active' | 'error', error?: string) => void;
}) {
    if (!Number.isInteger(options.activeLimit) || options.activeLimit < 1) throw new Error('Collider residency activeLimit must be a positive integer');
    const entries = new Map<string, { revision: string; shape?: Shape; error?: string; active: boolean }>();
    let targets: ColliderResidencyTarget[] = [], building = false, disposed = false;
    let wanted: string[] = [];
    const deactivate = (id: string, entry: { active: boolean }, report = true) => {
        if (!entry.active) return;
        options.deactivate(id); entry.active = false;
        if (report) options.report?.(id, 'ready');
    };
    return {
        get activeIds() { return [...entries].filter(([, e]) => e.active).map(([id]) => id); },
        get preparedCount() { return [...entries.values()].filter(entry => entry.shape !== undefined).length; },
        get ready() { return wanted.length > 0 && wanted.every(id => entries.get(id)?.active); },
        update(next: ColliderResidencyTarget[]) {
            if (disposed) return;
            targets = [...next].sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
            const current = new Map(targets.map(target => [target.id, target]));
            for (const [id, entry] of entries) {
                if (current.get(id)?.revision !== entry.revision) { deactivate(id, entry, false); entries.delete(id); }
            }
            for (const target of targets) if (!entries.has(target.id)) {
                entries.set(target.id, { revision: target.revision, active: false }); options.report?.(target.id, 'queued');
            }
            wanted = targets.slice(0, options.activeLimit).map(t => t.id);
            for (const [id, entry] of entries) if (!wanted.includes(id)) deactivate(id, entry);
            for (const id of wanted) {
                const entry = entries.get(id)!;
                if (entry.shape && !entry.active && !entry.error) {
                    try { options.activate(id, entry.shape); entry.active = true; options.report?.(id, 'active'); }
                    catch (error) { entry.error = String(error); options.report?.(id, 'error', entry.error); }
                }
            }
            // One outstanding worker job bounds message/clone costs. Nearest candidates
            // take priority; remaining shapes are prepared for later activation.
            if (building) return;
            const target = targets.find(t => { const e = entries.get(t.id)!; return !e.shape && !e.error; });
            if (!target) return;
            const entry = entries.get(target.id)!;
            building = true; options.report?.(target.id, 'building');
            Promise.resolve().then(() => options.build(target)).then(shape => {
                if (!disposed && entries.get(target.id) === entry) { entry.shape = shape; options.report?.(target.id, 'ready'); }
            }, error => {
                if (!disposed && entries.get(target.id) === entry) { entry.error = String(error); options.report?.(target.id, 'error', entry.error); }
            }).finally(() => { building = false; });
        },
        dispose() { disposed = true; for (const [id, entry] of entries) deactivate(id, entry, false); entries.clear(); },
    };
}
