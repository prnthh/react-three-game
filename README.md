# react-three-game

**Declarative 3D game engine for React. Zero boilerplate, maximum AI-generation surface area.**

```bash
npm i react-three-game @react-three/fiber three
```

## Core API

### `<Game>` - Root wrapper
```jsx
import { Canvas } from '@react-three/fiber';
import { Game } from 'react-three-game';

<Canvas>
  <Game gravity={[0, -9.8, 0]} debug={false}>
    {/* entities here */}
  </Game>
</Canvas>
```

### `<Entity>` - Scene object with optional physics
```jsx
<Entity 
  position={[x, y, z]}
  rotation={[x, y, z]}
  scale={[x, y, z]}
  physics="dynamic" // "static" | "kinematic" | false
  mass={1}
  collider="cuboid" // "sphere" | "capsule" | "trimesh"
>
  <mesh><boxGeometry /><meshStandardMaterial /></mesh>
</Entity>
```

### `<Prefab>` - Reusable entity templates
```jsx
<Prefab src="/models/player.json" position={[0, 1, 0]} />
```

## Hooks

### `useKeyboardControls()` - Input state
```jsx
const { forward, backward, left, right, jump, sprint } = useKeyboardControls();
// Returns boolean map: WASD → forward/left/backward/right, Space → jump, Shift → sprint
```

### `useGamepadControls()` - Controller input
```jsx
const { leftStick, rightStick, buttons } = useGamepadControls();
// leftStick/rightStick: { x, y } normalized -1 to 1
// buttons: { a, b, x, y, ... } boolean map
```

### `useEntity()` - Access entity ref/physics
```jsx
const { ref, velocity, applyImpulse, setVelocity } = useEntity();
applyImpulse([0, 10, 0]); // Jump
setVelocity([vx, vy, vz]);
```

### `useGameState()` - Global game state
```jsx
const [state, setState] = useGameState('score', 0);
const { pause, resume, isPaused, restart } = useGameLoop();
```

### `useRaycast()` - Physics raycast
```jsx
const hit = useRaycast(origin, direction, maxDistance);
// Returns: { point: [x,y,z], normal: [x,y,z], entity: ref } | null
```

### `useCollision()` - Collision events
```jsx
useCollision((other) => {
  console.log('Hit entity:', other);
}, [dependencies]);
```

## Complete Example - FPS Controller

```jsx
import { Canvas } from '@react-three/fiber';
import { Game, Entity, useKeyboardControls, useEntity, Prefab } from 'react-three-game';

function Player() {
  const controls = useKeyboardControls();
  const { ref, velocity, applyImpulse } = useEntity();
  
  useFrame(() => {
    const speed = controls.sprint ? 8 : 5;
    const vx = (controls.right - controls.left) * speed;
    const vz = (controls.backward - controls.forward) * speed;
    ref.current.setVelocity([vx, velocity[1], vz]);
    
    if (controls.jump && Math.abs(velocity[1]) < 0.1) {
      applyImpulse([0, 5, 0]);
    }
  });
  
  return (
    <Entity physics="dynamic" mass={70} collider="capsule" position={[0, 2, 0]}>
      <capsuleGeometry args={[0.5, 1]} />
    </Entity>
  );
}

function Ground() {
  return (
    <Entity physics="static" position={[0, 0, 0]}>
      <mesh>
        <boxGeometry args={[100, 1, 100]} />
        <meshStandardMaterial color="#2d5f2e" />
      </mesh>
    </Entity>
  );
}

function Enemy({ position }) {
  useCollision((other) => {
    if (other.tag === 'player') {
      // Damage logic
    }
  });
  
  return <Prefab src="/enemies/zombie.json" position={position} />;
}

export default function App() {
  return (
    <Canvas camera={{ fov: 75, position: [0, 5, 10] }}>
      <Game gravity={[0, -9.8, 0]}>
        <ambientLight intensity={0.3} />
        <directionalLight position={[10, 10, 5]} />
        
        <Player />
        <Ground />
        <Enemy position={[5, 0, -5]} />
        <Enemy position={[-3, 0, -8]} />
      </Game>
    </Canvas>
  );
}
```

## Asset Loading

```jsx
import { useGLTF, useTexture } from 'react-three-game';

const model = useGLTF('/models/scene.glb');
const texture = useTexture('/textures/ground.jpg');
```

## Event System

```jsx
import { GameEvents } from 'react-three-game';

// Emit
GameEvents.emit('enemyKilled', { score: 100 });

// Listen
GameEvents.on('enemyKilled', (data) => {
  setScore(s => s + data.score);
});
```

## Prefab Editor Tool

Visual editor at `/tools/prefabeditor`:
- Drag-drop models
- Configure components (Transform, Physics, Materials)
- Export JSON for `<Prefab>` component
- Live preview

## Pattern Library

**Third-person camera:**
```jsx
const { ref } = useEntity();
useFrame(({ camera }) => {
  camera.position.lerp(
    ref.current.position.clone().add(new Vector3(0, 3, 5)),
    0.1
  );
  camera.lookAt(ref.current.position);
});
```

**Health system:**
```jsx
const [health, setHealth] = useGameState('health', 100);
useCollision((other) => {
  if (other.tag === 'damage') setHealth(h => Math.max(0, h - 10));
});
```

**Spawn system:**
```jsx
const [enemies, setEnemies] = useState([]);
useInterval(() => {
  setEnemies(e => [...e, { id: uuid(), pos: randomPos() }]);
}, 5000);
```

## API Cheatsheet

| Component | Props | Usage |
|-----------|-------|-------|
| `<Game>` | `gravity`, `debug` | Root wrapper |
| `<Entity>` | `position`, `rotation`, `physics`, `mass`, `collider` | Scene object |
| `<Prefab>` | `src`, ...Entity props | Load JSON template |

| Hook | Returns | Usage |
|------|---------|-------|
| `useKeyboardControls()` | `{ forward, left, jump, ... }` | Input booleans |
| `useGamepadControls()` | `{ leftStick, buttons }` | Controller state |
| `useEntity()` | `{ ref, velocity, applyImpulse }` | Physics control |
| `useGameState(key, initial)` | `[value, setValue]` | Global state |
| `useGameLoop()` | `{ pause, resume, isPaused }` | Game flow |
| `useRaycast(origin, dir, max)` | `hit \| null` | Physics query |
| `useCollision(callback)` | - | Collision events |

---

**Status:** Alpha v0.0.1 | MIT License  
**AI Prompt:** "Build a [game type] using react-three-game with [features]"