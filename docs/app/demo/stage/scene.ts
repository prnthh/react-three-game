import type { DialogueAction, DialogueLibrary } from "./game";

export function gameAssetUrl(rootFolder: string, file: string, basePath = "") {
    return `${basePath.replace(/\/$/, "")}/${rootFolder.replace(/^\/+|\/+$/g, "")}/${file.replace(/^\/+/, "")}`;
}

export async function loadGameJson<T>(rootFolder: string, file: string, signal?: AbortSignal, basePath = ""): Promise<T> {
    const url = gameAssetUrl(rootFolder, file, basePath);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
    return response.json();
}

export function dialoguePages(library: DialogueLibrary, id: string, action: DialogueAction) {
    const pages = library[id]?.[action];
    if (!Array.isArray(pages) || pages.some(page => typeof page !== "string")) throw new Error(`Missing ${action} dialogue for ${id}`);
    return pages.filter(page => page.trim());
}
