import PrefabEditor from "./PrefabEditor";


export default function PrefabEditorPage() {
    return <div style={{ width: '100%', height: '100%' }}>
        <PrefabEditor>
            <directionalLight position={[5, 10, 7.5]} intensity={1} castShadow />
        </PrefabEditor>
    </div>
}
