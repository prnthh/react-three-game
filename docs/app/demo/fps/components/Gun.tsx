import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { asset } from "../assets";

export function Gun({ castShadow = false }: { castShadow?: boolean }) {
  const { scene } = useGLTF(asset("relay-carbine"));
  const object = useMemo(() => {
    const object = scene.clone(true);
    object.traverse(part => { if ("isMesh" in part) part.castShadow = castShadow; });
    return object;
  }, [scene, castShadow]);
  return <primitive object={object} />;
}
