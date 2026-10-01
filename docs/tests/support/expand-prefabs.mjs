import {readFileSync} from 'node:fs';

export function readTestPrefab(url) {
    if(url.startsWith('data:application/json;charset=utf-8,')) return JSON.parse(decodeURIComponent(url.slice(url.indexOf(',')+1)));
    if(/^\/prefabs\/[a-z0-9-]+\.json$/.test(url)) return JSON.parse(readFileSync(new URL('../../public'+url,import.meta.url),'utf8'));
    throw new Error('Unsupported test prefab URL: '+url.slice(0,80));
}

/** Resolve embedded authoring prefabs for document-level geometry and route assertions.
 * Packed roots have no placement transform; keep that transform on the expanded placement.
 * Shared assets receive placement-scoped child IDs, matching the runtime's isolation.
 */
export function expandEmbeddedPrefabs(prefab) {
    function expand(node, depth=0) {
        if(depth>32)throw new Error('Prefab nesting exceeded 32 levels');
        const ref=Object.entries(node.components??{}).find(([,c])=>c?.type==='PrefabRef');
        if(!ref)return {...node,children:node.children?.map(n=>expand(n,depth))};
        const url=ref[1].properties.url;
        const asset=readTestPrefab(url);
        const root=expand(asset.root,depth+1);
        const components={...root.components,...node.components};delete components[ref[0]];
        const rename=n=>({...n,id:`${node.id}/${n.id}`,children:n.children?.map(rename)});
        const children=(root.children??[]).map(n=>root.id===node.id?n:rename(n));
        return {...root,...node,components,children:[...children,...(node.children??[]).map(n=>expand(n,depth+1))]};
    }
    return {...prefab,root:expand(prefab.root)};
}
