import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointLight, Scene, Vector3 } from 'three';

export type LightCullingGridOptions = {
    /** World-space cell width, clamped to at least 1. Default: 24. */
    cellSize?: number;
    /** Neighbor cells included on each axis, clamped to 0–4. Default: 1. */
    neighborRadius?: number;
};
type Source = { light: PointLight; layers: number };
type Slot = { light: PointLight; source: Source | null };
const position = new Vector3();
const cellAt = (p: Vector3, size: number) => [Math.floor(p.x/size),Math.floor(p.y/size),Math.floor(p.z/size)];

/** Cell membership is the only selection rule. Slots avoid light-identity shader rebuilds. */
export class LightCullingGridController {
    private sources = new Map<PointLight, Source>();
    private slots: Slot[] = [];
    private occupancyKey = '';
    private cameraCell: number[] = [];
    constructor(private scene: Scene, private policy: LightCullingGridOptions = {}) {
    }

    private discover() {
        const ownLights = new Set(this.slots.map(slot => slot.light));
        const found = new Set<PointLight>();
        // Include hidden branches so toggling visibility does not change slot capacity.
        this.scene.traverse(object => {
            const light = object as PointLight;
            if (!light.isPointLight || ownLights.has(light)) return;
            found.add(light);
            if (!this.sources.has(light)) this.sources.set(light, { light, layers: light.layers.mask });
            light.layers.mask = 0;
        });
        for (const [light, source] of this.sources) if (!found.has(light)) {
            light.layers.mask = source.layers;
            this.sources.delete(light);
        }
    }

    update(cameraPosition: Vector3) {
        this.discover();
        const size = Math.max(1, this.policy.cellSize ?? 24);
        const radius = Math.max(0, Math.min(4, Math.floor(this.policy.neighborRadius ?? 1)));
        this.cameraCell=cellAt(cameraPosition,size);
        const sources=[...this.sources.values()].map(source=>({source,cell:cellAt(source.light.getWorldPosition(position),size)}));
        // Size once for every possible occupied neighborhood, including hidden
        // sources. Toggling them cannot shrink the pool or change its shader key.
        const key=`${size}:${radius}:`+sources.map(({source,cell})=>`${cell}:${Number(source.light.castShadow)}:${source.light.shadow.mapSize.x}:${source.light.shadow.mapSize.y}`).join(';');
        if (key!==this.occupancyKey) {
            this.occupancyKey=key;
            const counts=new Map<string,[number,number]>();
            for (const {source,cell} of sources) for(let x=-radius;x<=radius;x++) for(let y=-radius;y<=radius;y++) for(let z=-radius;z<=radius;z++) {
                const key=[cell[0]+x,cell[1]+y,cell[2]+z].join(',');
                const count=counts.get(key)??[0,0];count[Number(source.light.castShadow)]++;counts.set(key,count);
            }
            const shadowSize=Math.max(512,...sources.filter(s=>s.source.light.castShadow).map(s=>Math.max(s.source.light.shadow.mapSize.x,s.source.light.shadow.mapSize.y)));
            for (const shadowed of [false,true]) {
                const required=Math.max(0,...[...counts.values()].map(n=>n[Number(shadowed)]));
                let available=this.slots.filter(s=>s.light.castShadow===shadowed).length;
                while(available++<required) {
                    const light=new PointLight('#ffffff',0);
                    light.name='Point light grid slot';light.castShadow=shadowed;
                    light.shadow.mapSize.set(512,512);light.shadow.autoUpdate=false;
                    this.scene.add(light);this.slots.push({light,source:null});
                }
            }
            // One map size across slots avoids reallocating targets on cell crossings.
            for(const slot of this.slots) if(slot.light.castShadow&&slot.light.shadow.mapSize.x!==shadowSize) {
                const shadow=slot.light.shadow;
                shadow.map?.dispose();shadow.map=null;
                shadow.mapSize.set(shadowSize,shadowSize);shadow.needsUpdate=true;
            }
        }
        const active=new Set<Source>();
        for (const {source,cell} of sources) {
            if(cell.some((v,i)=>Math.abs(v-this.cameraCell[i])>radius)) continue;
            let visible=source.light.intensity>0,attached=false;
            for(let n: typeof source.light.parent=source.light;n;n=n.parent) {
                visible=visible&&n.visible;if(n===this.scene) attached=true;
            }
            if(visible&&attached) active.add(source);
        }
        // Retain assignments within the same neighborhood; fill only vacant slots.
        for(const slot of this.slots) if(slot.source&&(!active.has(slot.source)||slot.source.light.castShadow!==slot.light.castShadow)) slot.source=null;
        const assigned=new Set(this.slots.map(s=>s.source));
        for(const source of active) if(!assigned.has(source)) {
            const slot=this.slots.find(s=>!s.source&&s.light.castShadow===source.light.castShadow);
            if(slot) {slot.source=source;slot.light.shadow.needsUpdate=true;}
        }
        for(const slot of this.slots) {
            const light=slot.light,source=slot.source;
            if(!source) {light.intensity=0;light.shadow.autoUpdate=false;light.shadow.needsUpdate=false;continue;}
            const input=source.light,previous=light.position.clone();
            input.getWorldPosition(light.position);this.scene.worldToLocal(light.position);
            light.color.copy(input.color);light.intensity=input.intensity;
            light.distance=input.distance;light.decay=input.decay;light.layers.mask=source.layers;
            const shadow=light.shadow,authored=input.shadow;
            shadow.bias=authored.bias;shadow.normalBias=authored.normalBias;shadow.radius=authored.radius;shadow.intensity=authored.intensity;
            const cameraChanged=shadow.camera.near!==authored.camera.near||shadow.camera.far!==authored.camera.far;
            shadow.camera.near=authored.camera.near;shadow.camera.far=authored.camera.far;
            if(cameraChanged) shadow.camera.updateProjectionMatrix();
            shadow.autoUpdate=light.castShadow&&authored.autoUpdate;
            shadow.needsUpdate=light.castShadow&&(shadow.needsUpdate||authored.needsUpdate||cameraChanged||!previous.equals(light.position));
            authored.needsUpdate=false;
        }
    }

    stats() { return {authored:this.sources.size,slots:this.slots.length,active:this.slots.filter(s=>s.source).length,cell:this.cameraCell,activeIds:this.slots.flatMap(s=>s.source?[s.source.light.id]:[])}; }
    dispose() {
        this.slots.forEach(slot => { this.scene.remove(slot.light); slot.light.dispose(); });
        this.sources.forEach(source => { source.light.layers.mask = source.layers; });
        this.slots = [];
        this.sources.clear();
    }
}

/**
 * Mount once inside an R3F canvas to select point lights around the camera.
 * Works with ordinary Three lights and prefab lights, without registration.
 * Stable light slots avoid shader rebuilds on cell crossings; unmount restores
 * authored light layers. Other light types are unaffected.
 */
export function LightCullingGrid({cellSize = 24, neighborRadius = 1}: LightCullingGridOptions) {
    const scene = useThree(state => state.scene);
    const controller = useRef<LightCullingGridController | null>(null);
    const cameraPosition = useRef(new Vector3());
    useLayoutEffect(() => {
        const current = new LightCullingGridController(scene, {cellSize, neighborRadius});
        controller.current = current;
        return () => { current.dispose(); controller.current = null; };
    }, [scene, cellSize, neighborRadius]);
    useFrame(({camera}) => {
        camera.getWorldPosition(cameraPosition.current);
        controller.current?.update(cameraPosition.current);
    });
    return null;
}
