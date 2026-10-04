import { colors, ui } from "../ui/styles.js";
import type { ComponentEditorProps } from '../../core/ComponentRegistry.js';
import { BooleanField, FieldGroup, StringField } from '../ui/Input.js';
import type { MeshProperties } from "../../runtime/rendering/meshProperties.js";

type MeshFieldsProps = Pick<ComponentEditorProps<MeshProperties>, 'properties' | 'update'> & {
    instancing?: boolean;
    frustumCulledDefault?: boolean;
};

function MeshFields({ properties, update, instancing = true, frustumCulledDefault = true }: MeshFieldsProps) {
    return <details style={{ ...ui.secondaryPanel, padding: 6 }}>
        <summary style={{ cursor: 'pointer', color: colors.textMuted, fontSize: 11 }}>Mesh options</summary>
        <div style={{ paddingTop: 8 }}>
            <FieldGroup>
                <BooleanField name="visible" label="Visible" values={properties} onChange={update} fallback />
                <BooleanField name="castShadow" label="Cast Shadow" values={properties} onChange={update} fallback />
                <BooleanField name="receiveShadow" label="Receive Shadow" values={properties} onChange={update} fallback />
                <BooleanField name="frustumCulled" label="Frustum Culling" values={properties} onChange={update} fallback={frustumCulledDefault} />
                {instancing && <BooleanField name="instanced" label="Allow Instancing" values={properties} onChange={update} fallback />}
                <BooleanField name="emitClickEvent" label="Emit Click Event" values={properties} onChange={update} fallback={false} />
                {properties.emitClickEvent ? (
                    <StringField
                        name="clickEventName"
                        label="Click Event Name"
                        values={properties}
                        onChange={update}
                        placeholder="node:click"
                    />
                ) : null}
            </FieldGroup>
        </div>
    </details>;
}

export default MeshFields;
