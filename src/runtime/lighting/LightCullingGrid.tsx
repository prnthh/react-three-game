import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { usePendingMounts } from '../prefabs/ProgressiveMount.js';
import { PointLight, Scene, Vector3, type Object3D } from 'three';

export type LightCullingGridOptions = {
    /** World-space cell width, clamped to at least 1. Default: 24. */
    cellSize?: number;
    /** Neighbor cells included on each axis, clamped to 0–4. Default: 1. */
    neighborRadius?: number;
};
type Source = { light: PointLight; layers: number };
const shadowResolution = (light: PointLight) => light.castShadow ? Math.max(512, light.shadow.mapSize.x, light.shadow.mapSize.y) : 0;
type Slot = { light: PointLight; source: Source | null };
const position = new Vector3();
const cellAt = (p: Vector3, size: number) => [Math.floor(p.x/size),Math.floor(p.y/size),Math.floor(p.z/size)];

/** Cell membership is the only selection rule. Slots avoid light-identity shader rebuilds. */
export class LightCullingGridController {
    private sources = new Map<PointLight, Source>();
    private slots: Slot[] = [];
    private preparing = false;
    private occupancyKey = '';
    private cameraCell: number[] = [];
    private ownLights = new Set<PointLight>();
    private watched = new Set<Object3D>();
    private added = (event: { child: Object3D }) => this.watch(event.child);
    private removed = (event: { child: Object3D }) => this.unwatch(event.child);
    constructor(private scene: Scene, private policy: LightCullingGridOptions = {}) {
        this.watch(scene);
    }

    private watch(object: Object3D) {
        if (this.watched.has(object) || this.ownLights.has(object as PointLight)) return;
        this.watched.add(object);
        object.addEventListener('childadded', this.added);
        object.addEventListener('childremoved', this.removed);
        const light = object as PointLight;
        if (light.isPointLight) {
            this.sources.set(light, { light, layers: light.layers.mask });
            light.layers.mask = 0;
        }
        object.children.forEach(child => this.watch(child));
    }

    private unwatch(object: Object3D) {
        if (!this.watched.delete(object)) return;
        object.removeEventListener('childadded', this.added);
        object.removeEventListener('childremoved', this.removed);
        const light = object as PointLight;
        const source = this.sources.get(light);
        if (source) {
            light.layers.mask = source.layers;
            this.sources.delete(light);
        }
        object.children.forEach(child => this.unwatch(child));
    }

    update(cameraPosition: Vector3, preparing = false) {
        const finishPreparation = this.preparing && !preparing;
        this.preparing = preparing;
        const size = Math.max(1, this.policy.cellSize ?? 24);
        const radius = Math.max(0, Math.min(4, Math.floor(this.policy.neighborRadius ?? 1)));
        this.cameraCell=cellAt(cameraPosition,size);
        const sources=[...this.sources.values()].map(source=>({source,cell:cellAt(source.light.getWorldPosition(position),size)}));
        // Size once for every possible occupied neighborhood, including hidden
        // sources. Toggling them cannot shrink the pool or change its shader key.
        const key=`${size}:${radius}:`+sources.map(({source,cell})=>`${cell}:${Number(source.light.castShadow)}:${source.light.shadow.mapSize.x}:${source.light.shadow.mapSize.y}`).join(';');
        if (key!==this.occupancyKey) {
            this.occupancyKey=key;
            const counts = new Map<string, Map<number, number>>();
            const required = new Map<number, number>();
            for (const {source, cell} of sources) {
                const resolution = shadowResolution(source.light);
                for (let x=-radius;x<=radius;x++) for (let y=-radius;y<=radius;y++) for (let z=-radius;z<=radius;z++) {
                    const key = [cell[0]+x, cell[1]+y, cell[2]+z].join(',');
                    let neighborhood = counts.get(key);
                    if (!neighborhood) counts.set(key, neighborhood = new Map());
                    const count = (neighborhood.get(resolution) ?? 0) + 1;
                    neighborhood.set(resolution, count);
                    required.set(resolution, Math.max(required.get(resolution) ?? 0, count));
                }
            }
            // A slot's resolution never changes: WebGPU shader bindings may still
            // reference its depth texture while new streamed lights are prepared.
            for (const [resolution, count] of required) {
                let available = this.slots.filter(slot => shadowResolution(slot.light) === resolution).length;
                while (available++ < count) {
                    const light = new PointLight('#ffffff', 0);
                    light.name = 'Point light grid slot';
                    light.castShadow = resolution > 0;
                    light.shadow.mapSize.set(resolution || 512, resolution || 512);
                    light.shadow.autoUpdate = false;
                    light.shadow.needsUpdate = light.castShadow;
                    this.ownLights.add(light);
                    this.scene.add(light);
                    this.slots.push({ light, source: null });
                }
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
        for(const slot of this.slots) if(slot.source&&(!active.has(slot.source)||shadowResolution(slot.source.light)!==shadowResolution(slot.light))) slot.source=null;
        const assigned=new Set(this.slots.map(s=>s.source));
        for(const source of active) if(!assigned.has(source)) {
            const slot=this.slots.find(s=>!s.source&&shadowResolution(s.light)===shadowResolution(source.light));
            if(slot) {slot.source=source;slot.light.shadow.needsUpdate=true;}
        }
        for(const slot of this.slots) {
            const light=slot.light,source=slot.source;
            // Prepare dormant shadow passes as geometry streams, rather than compiling
            // all of their casters on the first cell crossing. No idle work afterward.
            const warmSource = !source && (preparing || finishPreparation)
                ? sources.find(({source}) => !assigned.has(source) && shadowResolution(source.light) === shadowResolution(light))?.source
                : null;
            if (warmSource) assigned.add(warmSource);
            const input = (source ?? warmSource)?.light;
            if(!input) {light.intensity=0;light.shadow.autoUpdate=false;continue;}
            const previous=light.position.clone();
            input.getWorldPosition(light.position);this.scene.worldToLocal(light.position);
            light.color.copy(input.color);light.intensity=source ? input.intensity : 0;
            light.distance=input.distance;light.decay=input.decay;light.layers.mask=(source ?? warmSource)!.layers;
            const shadow=light.shadow,authored=input.shadow;
            shadow.bias=authored.bias;shadow.normalBias=authored.normalBias;shadow.radius=authored.radius;shadow.intensity=authored.intensity;
            const cameraChanged=shadow.camera.near!==authored.camera.near||shadow.camera.far!==authored.camera.far;
            shadow.camera.near=authored.camera.near;shadow.camera.far=authored.camera.far;
            if(cameraChanged) shadow.camera.updateProjectionMatrix();
            shadow.autoUpdate=light.castShadow&&(source ? authored.autoUpdate : preparing);
            shadow.needsUpdate=light.castShadow&&(shadow.needsUpdate||!!warmSource||authored.needsUpdate||cameraChanged||!previous.equals(light.position));
            authored.needsUpdate=false;
        }
    }

    stats() { return {authored:this.sources.size,slots:this.slots.length,active:this.slots.filter(s=>s.source).length,cell:this.cameraCell,activeIds:this.slots.flatMap(s=>s.source?[s.source.light.id]:[])}; }
    dispose() {
        this.unwatch(this.scene);
        this.slots.forEach(slot => { this.scene.remove(slot.light); slot.light.dispose(); });
        this.sources.forEach(source => { source.light.layers.mask = source.layers; });
        this.slots = [];
        this.sources.clear();
        this.ownLights.clear();
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
    const preparing = usePendingMounts();
    const controller = useRef<LightCullingGridController | null>(null);
    const cameraPosition = useRef(new Vector3());
    useLayoutEffect(() => {
        const current = new LightCullingGridController(scene, {cellSize, neighborRadius});
        controller.current = current;
        return () => { current.dispose(); controller.current = null; };
    }, [scene, cellSize, neighborRadius]);
    useFrame(({camera}) => {
        camera.getWorldPosition(cameraPosition.current);
        controller.current?.update(cameraPosition.current, preparing);
    });
    return null;
}
