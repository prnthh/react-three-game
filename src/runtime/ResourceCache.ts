/** A retained resource is shared; releasing a consumer never cancels another consumer. */
export interface ResourceLease<T> {
    readonly ready: Promise<T>;
    release(): void;
}

interface Entry<T> {
    value?: T;
    ready: Promise<T>;
    references: number;
    settled: boolean;
    retired: boolean;
    disposed: boolean;
    lastUsed: number;
}

/** Scene-owned cache. Active resources are pinned; only idle resources may be evicted. */
export class ResourceCache<T> {
    private entries = new Map<string, Entry<T>>();
    private closed = false;
    private retired = new Map<Entry<T>, string>();
    private clock = 0;

    constructor(private readonly disposeValue: (value: T, key: string) => void, private readonly maxIdle = 32) {}

    get(key: string): T | undefined { return this.entries.get(key)?.value; }

    acquire(key: string, load: () => Promise<T>): ResourceLease<T> {
        if (this.closed) throw new Error('Resource cache has been disposed');
        let entry = this.entries.get(key);
        if (!entry) {
            entry = { ready: null!, references: 0, settled: false, retired: false, disposed: false, lastUsed: ++this.clock };
            const created = entry;
            this.entries.set(key, created);
            created.ready = Promise.resolve().then(load).then(value => {
                created.settled = true;
                created.value = value;
                if (this.closed || (created.retired && created.references === 0)) this.disposeEntry(created, key);
                if (this.closed) throw new Error(`Resource cache disposed while loading ${key}`);
                this.trim();
                return value;
            }, error => {
                // Failed requests are retryable; an old lease cannot remove a newer request.
                if (this.entries.get(key) === created) this.entries.delete(key);
                this.retired.delete(created);
                throw error;
            });
        }
        entry.references++;
        entry.lastUsed = ++this.clock;
        const retained = entry;
        let released = false;
        return {
            ready: retained.ready,
            release: () => {
                if (released) return;
                released = true;
                retained.references--;
                retained.lastUsed = ++this.clock;
                // Allow effect cleanup/setup and chunk handoffs to reacquire before eviction.
                queueMicrotask(() => {
                    if (retained.retired && retained.references === 0 && retained.settled) this.disposeEntry(retained, key);
                    this.trim();
                });
            },
        };
    }

    /** Retire a replaced slot without disposing objects still held by existing instances. */
    invalidate(key: string) {
        const entry = this.entries.get(key);
        if (!entry) return;
        this.entries.delete(key);
        entry.retired = true;
        this.retired.set(entry, key);
        if (entry.references === 0 && entry.settled) this.disposeEntry(entry, key);
    }

    private disposeEntry(entry: Entry<T>, key: string) {
        if (entry.disposed) return;
        entry.disposed = true;
        this.retired.delete(entry);
        if (entry.value !== undefined) this.disposeValue(entry.value, key);
    }

    private trim() {
        const idle = [...this.entries].filter(([, entry]) => entry.references === 0 && entry.settled)
            .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
        for (const [key, entry] of idle.slice(0, Math.max(0, idle.length - this.maxIdle))) {
            this.entries.delete(key);
            this.disposeEntry(entry, key);
        }
    }

    dispose() {
        if (this.closed) return;
        this.closed = true;
        for (const [key, entry] of this.entries) if (entry.settled) this.disposeEntry(entry, key);
        for (const [entry, key] of this.retired) if (entry.settled) this.disposeEntry(entry, key);
        this.entries.clear();
    }
}
