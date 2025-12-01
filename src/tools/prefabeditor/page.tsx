import PrefabEditor from "./PrefabEditor";


export default function PrefabEditorPage() {
    return <div className="w-screen h-screen">
        <PrefabEditor>
            <directionalLight position={[5, 10, 7.5]} intensity={1} castShadow />
        </PrefabEditor>
    </div>
}
