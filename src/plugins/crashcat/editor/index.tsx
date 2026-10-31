import { registerComponentEditor } from '../../../editor/ComponentEditors.js';
import { TerrainPhysicsComponent, terrainPhysicsProblem } from '../TerrainPhysicsComponent.js';
registerComponentEditor(TerrainPhysicsComponent, ({ node, properties, update }) => {
    const problem = terrainPhysicsProblem(node);
    return <div>
        {problem ? <p role="alert" style={{ color: '#ff8888' }}>{problem}</p> : <p>Height map found. TerrainPhysicsRuntime prepares colliders in a worker using the host’s active collider budget.</p>}
        <label>Friction <input type="number" min={0} max={2} step={.05} value={properties.friction ?? .8}
            onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) update({ friction: Math.max(0, Math.min(2, value)) }); }} /></label>
    </div>;
});
