import { useNode, type Component } from "react-three-game/viewer";

/** Editor-only markers are children of the node, so selection and transforms work normally. */
export const SpawnPointComponent: Component<{ team: "alpha" | "bravo" }> = {
  name: "FPSSpawnPoint",
  category: "misc",
  description: "Team spawn position and facing. Forward is local -Z. Read by the match authority on map load.",
  properties: { team: { type: "select", default: "alpha", options: [
    { value: "alpha", label: "Alpha / Remilio" }, { value: "bravo", label: "Bravo / Milady" },
  ] } },
  View: function SpawnPointView({ properties, children }) {
    const { editMode, isSelected } = useNode();
    const color = isSelected ? "#ffffff" : properties.team === "bravo" ? "#ff795c" : "#49dbbd";
    return <>{children}{editMode && <group>
      <mesh position={[0, 0.9, 0]} renderOrder={10000}>
        <capsuleGeometry args={[0.3, 1.2, 4, 8]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.65} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.08, -0.65]} renderOrder={10000}>
        <boxGeometry args={[0.07, 0.07, 1.3]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.08, -1.4]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10000}>
        <coneGeometry args={[0.2, 0.4, 8]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>}</>;
  },
};
