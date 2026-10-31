import { useCallback, useState, useSyncExternalStore } from 'react';
import { getSceneComponentRegistry } from '../../runtime/scene/SceneContext.js';
import { resolveGameObject } from '../../runtime/scene/gameObject.js';
import type { BoneAttachmentProperties } from '../../runtime/components/BoneAttachmentComponent.js';
import { base } from '../ui/styles.js';
import MeshFields from "./MeshFields.js";
import { useEditorRef } from '../EditorContext.js';
import type { ComponentEditorProps } from '../../core/ComponentRegistry.js';
import { BooleanField, FieldGroup, NumberField, StringField, NodeField, SelectField, SelectInput } from '../ui/Input.js';
import { ModelPicker } from '../assets/AssetBrowser.js';
import { SKINNED_MESH_COMPONENT, type SkinnedMeshProperties } from "../../runtime/components/SkinnedMeshComponent.js";

/** Observe mounted instance metadata; no polling or independent model loading. */
function useEditorSkinnedMesh(nodeId: string) {
    const editor = useEditorRef();
    let scene = editor.root;
    while (scene?.parent) scene = scene.parent;
    const registry = scene ? getSceneComponentRegistry(scene) : null;
    const subscribe = useCallback((notify: () => void) => {
        const object = editor.subscribeObject(nodeId, notify);
        const model = registry?.subscribe(SKINNED_MESH_COMPONENT, notify);
        return () => { object(); model?.(); };
    }, [editor, nodeId, registry]);
    const snapshot = useCallback(() => {
        const object = editor.getObject(nodeId);
        return object ? resolveGameObject(object)?.getComponent(SKINNED_MESH_COMPONENT) ?? null : null;
    }, [editor, nodeId]);
    return useSyncExternalStore(subscribe, snapshot, () => null);
}

export function BoneAttachmentEditor({ properties, update }: ComponentEditorProps<BoneAttachmentProperties>) {
    const model = useEditorSkinnedMesh(properties.targetId?.trim() ?? '');
    const bones = model?.bones ?? [];
    const options = [{ value: '', label: 'Choose bone' }, ...bones.map(bone => ({ value: bone.name, label: bone.name }))];
    if (properties.bone && !model?.getBone(properties.bone))
        options.push({ value: properties.bone, label: `${properties.bone} (unavailable)` });
    return <FieldGroup>
        <NodeField name="targetId" label="Skinned mesh" values={properties} onChange={update} />
        <SelectField name="bone" label="Bone" values={properties} onChange={update} options={options} />
        {!model ? <small>Select a loaded SkinnedMesh node.</small> : !bones.length ? <small>This model has no bones.</small>
            : properties.bone && !model.getBone(properties.bone) ? <small>The selected bone is missing from this model.</small> : null}
        <small>This node’s Transform sets the bone-local offset. Add Model or Geometry to display equipment.</small>
    </FieldGroup>;
}

function SkinnedMeshEditor({ node, properties, update }: ComponentEditorProps<SkinnedMeshProperties>) {
    const editor = useEditorRef();
    const { basePath } = editor;
    const model = useEditorSkinnedMesh(node.id);
    const [selectedBone, setSelectedBone] = useState('');
    const bone = model?.getBone(selectedBone)?.name ?? model?.bones[0]?.name ?? '';
    const addAttachment = () => {
        if (!bone) return;
        const id = crypto.randomUUID();
        const equipmentId = crypto.randomUUID();
        editor.add({ id, name: `${bone} attachment`, components: {
            attachment: { type: 'BoneAttachment', properties: { targetId: node.id, bone } },
        }, children: [{ id: equipmentId, name: 'Equipment', components: {
            transform: { type: 'Transform', properties: {} },
            model: { type: 'Model', properties: { filename: '' } },
        } }] }, node.id);
        editor.scene.select({ id: equipmentId });
    };
    return <FieldGroup>
        <ModelPicker value={properties.filename} onChange={filename => update({ filename })} basePath={basePath} pickerKey={node.id} />
        <StringField name="animationState" label="Animation State" values={properties} onChange={update} />
        <NumberField name="fadeDuration" label="Fade Duration" values={properties} onChange={update} fallback={0.18} min={0} step={0.05} />
        <BooleanField name="autoUpdate" label="Auto Update" values={properties} onChange={update} fallback />
        {!!model?.bones.length && <>
            <SelectInput label="Attachment bone" value={bone} onChange={setSelectedBone}
                options={model.bones.map(bone => ({ value: bone.name, label: bone.name }))} />
            <button type="button" style={base.btn} onClick={addAttachment}>Add bone attachment</button>
        </>}
        <MeshFields properties={properties} update={update} instancing={false} frustumCulledDefault={false} />
    </FieldGroup>;
}

export default SkinnedMeshEditor;
