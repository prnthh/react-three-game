export interface ScoredLight {
    id: string;
    score: number;
}

/** Keep surviving lights in the same physical slots; prefer incumbents near a cutoff. */
export function selectLightSlots(
    candidates: readonly ScoredLight[],
    previous: readonly (string | null)[],
    capacity: number,
    hysteresis = 0.2,
): (string | null)[] {
    const count = Math.max(0, Math.floor(capacity));
    const retained = new Set(previous);
    const ranked = candidates.filter(light => Number.isFinite(light.score) && light.score > 0)
        .map(light => ({ ...light, score: light.score * (retained.has(light.id) ? 1 + hysteresis : 1) }))
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const selected = new Set(ranked.slice(0, count).map(light => light.id));
    const result = Array.from({ length: count }, (_, index) => {
        const id = previous[index];
        return id && selected.delete(id) ? id : null;
    });
    const remaining = ranked.filter(light => selected.delete(light.id));
    let next = 0;
    return result.map(id => id ?? remaining[next++]?.id ?? null);
}
