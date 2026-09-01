import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import {
    PrefabEditorMode,
    useNodeObject,
    usePrefab,
    useScene,
    type Component,
    type ComponentViewProps,
    type PrefabNode,
} from "react-three-game";

type GridCoordinate = [number, number, number];

type PrefabGridStreamerProperties = {
    tileSize?: GridCoordinate;
    tileCenter?: GridCoordinate;
    maxTiles?: number;
    templateNodeId?: string;
};

const measuredCameraWorldPosition = new Vector3();
const measuredCameraLocalPosition = new Vector3();
const cameraTravelDirection = new Vector3();

function gridKey([x, y, z]: GridCoordinate) {
    return `${x},${y},${z}`;
}

function getAxisCell(position: number, size: number, center: number) {
    if (size <= 0) return 0;
    return Math.floor((position - center + size * 0.5) / size);
}

function getGridCell(position: Vector3, tileSize: GridCoordinate, tileCenter: GridCoordinate): GridCoordinate {
    return [
        getAxisCell(position.x, tileSize[0], tileCenter[0]),
        getAxisCell(position.y, tileSize[1], tileCenter[1]),
        getAxisCell(position.z, tileSize[2], tileCenter[2]),
    ];
}

function getTravelStep(direction: Vector3, tileSize: GridCoordinate): GridCoordinate {
    const normalized = tileSize.map((size, axis) => size > 0 ? Math.abs(direction.getComponent(axis)) / size : 0);
    const strongest = Math.max(...normalized);
    if (strongest <= 1e-8) return [0, 0, 0];
    return normalized.map((value, axis) => (
        value >= strongest * 0.75 ? Math.sign(direction.getComponent(axis)) : 0
    )) as GridCoordinate;
}

function addGridCoordinate(left: GridCoordinate, right: GridCoordinate): GridCoordinate {
    return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function getCellStep(from: GridCoordinate, to: GridCoordinate): GridCoordinate {
    return [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1]), Math.sign(to[2] - from[2])];
}

function setTilePosition(
    prefab: ReturnType<typeof usePrefab>,
    id: string,
    coordinate: GridCoordinate,
    tileSize: GridCoordinate,
) {
    prefab.update(id, (node: PrefabNode) => {
        const currentTransform = node.components?.transform;
        const currentProperties = currentTransform?.properties ?? {};
        const position: GridCoordinate = [
            coordinate[0] * tileSize[0],
            coordinate[1] * tileSize[1],
            coordinate[2] * tileSize[2],
        ];

        return {
            ...node,
            name: `Prefab Tile ${gridKey(coordinate)}`,
            components: {
                ...node.components,
                transform: {
                    type: "Transform",
                    properties: { ...currentProperties, position },
                },
            },
        };
    });
}

function PrefabGridStreamerView({ properties }: ComponentViewProps<PrefabGridStreamerProperties>) {
    const prefab = usePrefab();
    const { mode } = useScene();
    const streamerObjectRef = useNodeObject();
    const camera = useThree(state => state.camera);
    const tilesRef = useRef(new Map<string, string>());
    const lastWindowKeyRef = useRef<string | null>(null);
    const lastLayoutKeyRef = useRef<string | null>(null);
    const lastCameraCellRef = useRef<GridCoordinate | null>(null);
    const previousCellRef = useRef<GridCoordinate | null>(null);
    const travelStepRef = useRef<GridCoordinate>([0, 0, -1]);
    const hasPreviousCameraPositionRef = useRef(false);
    const previousCameraLocalPositionRef = useRef(new Vector3());
    const authoredTemplateRef = useRef<PrefabNode | null>(null);

    useEffect(() => () => {
        const templateNodeId = properties.templateNodeId?.trim();
        for (const id of tilesRef.current.values()) {
            if (id !== templateNodeId) prefab.remove(id);
        }
        tilesRef.current.clear();
        if (templateNodeId && authoredTemplateRef.current && prefab.get(templateNodeId)) {
            prefab.replaceNode(templateNodeId, authoredTemplateRef.current);
        }
        authoredTemplateRef.current = null;
        lastWindowKeyRef.current = null;
        lastLayoutKeyRef.current = null;
        lastCameraCellRef.current = null;
        previousCellRef.current = null;
        travelStepRef.current = [0, 0, -1];
        hasPreviousCameraPositionRef.current = false;
    }, [mode, prefab, properties.templateNodeId]);

    useFrame(() => {
        if (mode !== PrefabEditorMode.Play) return;
        const streamerObject = streamerObjectRef.current;
        const templateNodeId = properties.templateNodeId?.trim();
        if (!streamerObject || !templateNodeId) return;

        const requestedSize = properties.tileSize ?? [1, 0, 1];
        const tileSize = requestedSize.map(value => Math.max(0, Math.abs(value))) as GridCoordinate;
        const tileCenter = properties.tileCenter ?? [0, 0, 0];
        const maxTiles = Math.max(2, Math.min(3, Math.floor(properties.maxTiles ?? 3)));
        const tiles = tilesRef.current;
        if (tiles.size === 0) {
            const template = prefab.get(templateNodeId);
            if (!template) return;
            authoredTemplateRef.current = template;
            tiles.set(gridKey([0, 0, 0]), templateNodeId);
        }

        camera.getWorldPosition(measuredCameraWorldPosition);
        measuredCameraLocalPosition.copy(measuredCameraWorldPosition);
        streamerObject.worldToLocal(measuredCameraLocalPosition);
        if (hasPreviousCameraPositionRef.current) {
            cameraTravelDirection.copy(measuredCameraLocalPosition).sub(previousCameraLocalPositionRef.current);
            const measuredStep = getTravelStep(cameraTravelDirection, tileSize);
            if (measuredStep.some(value => value !== 0)) travelStepRef.current = measuredStep;
        }
        previousCameraLocalPositionRef.current.copy(measuredCameraLocalPosition);
        hasPreviousCameraPositionRef.current = true;

        const cameraCell = getGridCell(measuredCameraLocalPosition, tileSize, tileCenter);
        const cameraCellKey = gridKey(cameraCell);
        const previousCameraCell = lastCameraCellRef.current;
        if (previousCameraCell && gridKey(previousCameraCell) !== cameraCellKey) {
            previousCellRef.current = previousCameraCell;
            const crossedStep = getCellStep(previousCameraCell, cameraCell);
            if (crossedStep.some(value => value !== 0)) travelStepRef.current = crossedStep;
        }
        lastCameraCellRef.current = cameraCell;

        const layoutKey = `${tileSize.join(",")}|${tileCenter.join(",")}|${maxTiles}`;
        const windowKey = `${cameraCellKey}|${gridKey(travelStepRef.current)}|${layoutKey}`;
        const layoutChanged = lastLayoutKeyRef.current !== layoutKey;
        if (lastWindowKeyRef.current === windowKey) return;

        const desiredCoordinates = [
            ...(maxTiles === 3 && previousCellRef.current ? [previousCellRef.current] : []),
            cameraCell,
            addGridCoordinate(cameraCell, travelStepRef.current),
        ].filter((coordinate, index, values) => (
            values.findIndex(value => gridKey(value) === gridKey(coordinate)) === index
        ));
        const desiredKeys = new Set(desiredCoordinates.map(gridKey));
        let complete = true;

        // The authored template is the current center tile. Move it rather than
        // deleting it, and recreate the trailing edge from a disposable copy.
        const templateEntry = [...tiles.entries()].find(([, id]) => id === templateNodeId);
        if (templateEntry?.[0] !== cameraCellKey) {
            const displacedId = tiles.get(cameraCellKey);
            if (displacedId && displacedId !== templateNodeId) prefab.remove(displacedId);
            if (templateEntry) tiles.delete(templateEntry[0]);
            setTilePosition(prefab, templateNodeId, cameraCell, tileSize);
            tiles.set(cameraCellKey, templateNodeId);
        }

        // Mount the new edge before removing the old edge so shared prefab
        // resources remain referenced throughout the handoff.
        for (const coordinate of desiredCoordinates) {
            const key = gridKey(coordinate);
            const existingId = tiles.get(key);
            if (existingId) {
                if (layoutChanged) setTilePosition(prefab, existingId, coordinate, tileSize);
                continue;
            }
            const sourceId = tiles.values().next().value as string | undefined;
            const duplicatedId = sourceId ? prefab.duplicate(sourceId) : null;
            if (!duplicatedId) {
                complete = false;
                break;
            }
            setTilePosition(prefab, duplicatedId, coordinate, tileSize);
            tiles.set(key, duplicatedId);
        }

        if (!complete) return;
        for (const [key, id] of tiles) {
            if (desiredKeys.has(key)) continue;
            if (id === templateNodeId) continue;
            prefab.remove(id);
            tiles.delete(key);
        }
        lastLayoutKeyRef.current = layoutKey;
        lastWindowKeyRef.current = windowKey;
    }, -10);

    return null;
}

const PrefabGridStreamerComponent: Component<PrefabGridStreamerProperties> = {
    name: "PrefabGridStreamer",
    View: PrefabGridStreamerView,
    properties: {
        tileSize: { type: "vector3", default: [1, 0, 1] },
        tileCenter: { type: "vector3", default: [0, 0, 0] },
        maxTiles: { default: 3, min: 2, max: 3, step: 1 },
        templateNodeId: { type: "string", default: "" },
    },
};

export default PrefabGridStreamerComponent;
