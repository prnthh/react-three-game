import type { ComponentEditorProps } from './ComponentRegistry';
import { BooleanField, FieldGroup, FieldRenderer, ListEditor, NumberField, SelectField, StringField } from './Input';
import { colors, ui } from '../styles';
import { useEditorRef } from '../EditorContext';
import { SoundPicker } from '../../assetviewer/page';
import { SoundProperties, CLIP_MODE_OPTIONS } from "./SoundComponent";

function SoundComponentEditor({ properties, update }: ComponentEditorProps<SoundProperties>) {
    const { basePath } = useEditorRef();
    const clips = Array.isArray(properties.clips)
        ? properties.clips.map((clip: unknown) => typeof clip === 'string' ? clip : '')
        : [];
    const randomizePitch = Boolean(properties.randomizePitch);
    const randomizeVolume = Boolean(properties.randomizeVolume);
    const positional = Boolean(properties.positional);

    const setClips = (nextClips: string[]) => {
        update({ clips: nextClips });
    };

    const addClip = () => {
        setClips([...clips, '']);
    };

    const updateClip = (index: number, nextPath: string) => {
        const nextClips = [...clips];
        nextClips[index] = nextPath;
        setClips(nextClips);
    };

    const removeClip = (index: number) => {
        setClips(clips.filter((_, clipIndex) => clipIndex !== index));
    };

    return (
        <FieldGroup>
            <StringField
                name="eventName"
                label="Listen Event"
                values={properties}
                onChange={update}
                placeholder="player:footstep"
            />
            <BooleanField name="autoplay" label="Autoplay" values={properties} onChange={update} fallback={false} />
            <BooleanField name="loop" label="Loop" values={properties} onChange={update} fallback={false} />
            <FieldRenderer
                fields={[
                    {
                        name: 'clipMode',
                        label: 'Clip Mode',
                        type: 'select',
                        options: CLIP_MODE_OPTIONS.map(option => ({ value: option.value, label: option.label })),
                    },
                ]}
                values={properties}
                onChange={update}
            />
            <ListEditor
                label="Clips"
                items={clips}
                onAdd={addClip}
                emptyMessage="No clips added."
                addButtonTitle="Add clip"
                addDisabledTitle="Add clip"
                renderItem={(clip, index) => (
                    <div
                        key={`${clip}-${index}`}
                        style={{
                            ...ui.secondaryPanel,
                            display: 'flex',
                            gap: 6,
                            alignItems: 'end',
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <SoundPicker value={clip || undefined} onChange={(nextPath) => updateClip(index, nextPath ?? '')} basePath={basePath} />
                        </div>
                        <button
                            type="button"
                            onClick={() => removeClip(index)}
                            style={{
                                ...ui.compactActionButton,
                                height: 24,
                                background: colors.bgInput,
                            }}
                            title="Remove clip"
                        >
                            ×
                        </button>
                    </div>
                )}
            />
            <BooleanField name="positional" label="Positional" values={properties} onChange={update} fallback={false} />
            {positional ? (
                <>
                    <NumberField name="refDistance" label="Ref Distance" values={properties} onChange={update} fallback={1} min={0.01} step={0.1} />
                    <NumberField name="maxDistance" label="Max Distance" values={properties} onChange={update} fallback={24} min={0.01} step={0.1} />
                    <NumberField name="rolloffFactor" label="Rolloff" values={properties} onChange={update} fallback={1} min={0} step={0.1} />
                    <SelectField
                        name="distanceModel"
                        label="Distance Model"
                        values={properties}
                        onChange={update}
                        fallback="inverse"
                        options={[
                            { value: 'inverse', label: 'Inverse' },
                            { value: 'linear', label: 'Linear' },
                            { value: 'exponential', label: 'Exponential' },
                        ]}
                    />
                </>
            ) : null}
            <BooleanField name="randomizePitch" label="Random Pitch" values={properties} onChange={update} fallback={false} />
            {randomizePitch ? (
                <>
                    <NumberField name="minPitch" label="Min Pitch" values={properties} onChange={update} fallback={0.96} step={0.01} min={0.1} />
                    <NumberField name="maxPitch" label="Max Pitch" values={properties} onChange={update} fallback={1.04} step={0.01} min={0.1} />
                </>
            ) : (
                <NumberField name="pitch" label="Pitch" values={properties} onChange={update} fallback={1} step={0.01} min={0.1} />
            )}
            <BooleanField name="randomizeVolume" label="Random Volume" values={properties} onChange={update} fallback={false} />
            {randomizeVolume ? (
                <>
                    <NumberField name="minVolume" label="Min Volume" values={properties} onChange={update} fallback={0.9} step={0.01} min={0} />
                    <NumberField name="maxVolume" label="Max Volume" values={properties} onChange={update} fallback={1} step={0.01} min={0} />
                </>
            ) : (
                <NumberField name="volume" label="Volume" values={properties} onChange={update} fallback={1} step={0.01} min={0} />
            )}
        </FieldGroup>
    );
}

export default SoundComponentEditor;
