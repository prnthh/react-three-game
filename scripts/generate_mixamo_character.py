#!/usr/bin/env python3
"""Generate a stylized rigid humanoid and export it as a Mixamo-friendly FBX.

Run with Blender, not the system Python:

    blender --background --python scripts/generate_mixamo_character.py -- \
      --output docs/public/models/human/mixamo-anatomical-character.fbx

The body parts are disconnected low-poly shapes inside one skinned mesh. Every
part is weighted 100% to one matching deform bone, so it moves rigidly.
"""

from __future__ import annotations

import argparse
import math
import sys
from dataclasses import dataclass
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


@dataclass(frozen=True)
class Part:
    name: str
    parent: str | None
    center: tuple[float, float, float]
    size: tuple[float, float, float]
    bone_head: tuple[float, float, float]
    bone_tail: tuple[float, float, float]
    shape: str


# Blender coordinates: X = character left/right, Y = depth, Z = up.
# Proportions are deliberately stylized: large faceted head, broad jacket torso,
# tapered limbs, and chunky boots, while retaining a clean T-pose.
PARTS = (
    Part("Hips", None, (0.0, 0.0, 0.96), (0.38, 0.27, 0.24), (0.0, 0.0, 0.88), (0.0, 0.0, 1.04), "torso"),
    Part("Spine", "Hips", (0.0, 0.0, 1.13), (0.42, 0.29, 0.21), (0.0, 0.0, 1.04), (0.0, 0.0, 1.22), "torso"),
    Part("Spine1", "Spine", (0.0, 0.0, 1.31), (0.43, 0.28, 0.20), (0.0, 0.0, 1.22), (0.0, 0.0, 1.40), "torso"),
    Part("Spine2", "Spine1", (0.0, 0.0, 1.48), (0.42, 0.27, 0.19), (0.0, 0.0, 1.40), (0.0, 0.0, 1.56), "torso"),
    Part("Neck", "Spine2", (0.0, 0.0, 1.62), (0.12, 0.12, 0.13), (0.0, 0.0, 1.55), (0.0, 0.0, 1.69), "limb"),
    Part("Head", "Neck", (0.0, -0.015, 1.82), (0.35, 0.31, 0.36), (0.0, 0.0, 1.69), (0.0, 0.0, 1.94), "head"),
    Part("LeftShoulder", "Spine2", (0.185, 0.0, 1.51), (0.21, 0.20, 0.20), (0.12, 0.0, 1.51), (0.25, 0.0, 1.51), "shoulder"),
    Part("LeftArm", "LeftShoulder", (0.405, 0.0, 1.51), (0.32, 0.16, 0.16), (0.25, 0.0, 1.51), (0.55, 0.0, 1.51), "limb"),
    Part("LeftForeArm", "LeftArm", (0.685, 0.0, 1.51), (0.29, 0.13, 0.13), (0.55, 0.0, 1.51), (0.82, 0.0, 1.51), "limb"),
    Part("LeftHand", "LeftForeArm", (0.90, -0.005, 1.51), (0.17, 0.10, 0.085), (0.82, 0.0, 1.51), (0.98, 0.0, 1.51), "limb"),
    Part("RightShoulder", "Spine2", (-0.185, 0.0, 1.51), (0.21, 0.20, 0.20), (-0.12, 0.0, 1.51), (-0.25, 0.0, 1.51), "shoulder"),
    Part("RightArm", "RightShoulder", (-0.405, 0.0, 1.51), (0.32, 0.16, 0.16), (-0.25, 0.0, 1.51), (-0.55, 0.0, 1.51), "limb"),
    Part("RightForeArm", "RightArm", (-0.685, 0.0, 1.51), (0.29, 0.13, 0.13), (-0.55, 0.0, 1.51), (-0.82, 0.0, 1.51), "limb"),
    Part("RightHand", "RightForeArm", (-0.90, -0.005, 1.51), (0.17, 0.10, 0.085), (-0.82, 0.0, 1.51), (-0.98, 0.0, 1.51), "limb"),
    Part("LeftUpLeg", "Hips", (0.11, 0.0, 0.68), (0.22, 0.24, 0.45), (0.11, 0.0, 0.91), (0.11, 0.0, 0.47), "limb"),
    Part("LeftLeg", "LeftUpLeg", (0.11, 0.0, 0.28), (0.18, 0.20, 0.39), (0.11, 0.0, 0.47), (0.11, 0.0, 0.10), "limb"),
    Part("LeftFoot", "LeftLeg", (0.11, -0.05, 0.075), (0.18, 0.27, 0.14), (0.11, 0.0, 0.10), (0.11, -0.17, 0.06), "foot"),
    Part("LeftToeBase", "LeftFoot", (0.11, -0.21, 0.055), (0.18, 0.12, 0.09), (0.11, -0.17, 0.06), (0.11, -0.32, 0.05), "foot"),
    Part("RightUpLeg", "Hips", (-0.11, 0.0, 0.68), (0.22, 0.24, 0.45), (-0.11, 0.0, 0.91), (-0.11, 0.0, 0.47), "limb"),
    Part("RightLeg", "RightUpLeg", (-0.11, 0.0, 0.28), (0.18, 0.20, 0.39), (-0.11, 0.0, 0.47), (-0.11, 0.0, 0.10), "limb"),
    Part("RightFoot", "RightLeg", (-0.11, -0.05, 0.075), (0.18, 0.27, 0.14), (-0.11, 0.0, 0.10), (-0.11, -0.17, 0.06), "foot"),
    Part("RightToeBase", "RightFoot", (-0.11, -0.21, 0.055), (0.18, 0.12, 0.09), (-0.11, -0.17, 0.06), (-0.11, -0.32, 0.05), "foot"),
)


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        default="docs/public/models/human/mixamo-anatomical-character.fbx",
        help="FBX output path",
    )
    parser.add_argument("--blend", help="Optional .blend file to save before export")
    parser.add_argument("--no-prefix", action="store_true", help="Use bare bone names instead of mixamorig: names")
    parser.add_argument("--no-bevel", action="store_true", help="Keep the low-poly shapes' edges sharp")
    return parser.parse_args(argv)


def bone_name(part_name: str, prefix: str) -> str:
    return f"{prefix}{part_name}"


def reset_scene() -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def create_material(name: str, color: tuple[float, float, float, float]) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.metallic = 0.0
    material.roughness = 0.78
    return material


def create_materials() -> dict[str, bpy.types.Material]:
    return {
        "suit": create_material("FadedBlueSuit", (0.055, 0.30, 0.57, 1.0)),
        "skin": create_material("PaleSkin", (0.70, 0.61, 0.48, 1.0)),
        "glove": create_material("BlueGloves", (0.035, 0.20, 0.38, 1.0)),
        "boot": create_material("BlueBoots", (0.025, 0.15, 0.29, 1.0)),
    }


def material_for_part(part: Part, materials: dict[str, bpy.types.Material]) -> bpy.types.Material:
    if part.name in {"Head", "Neck"}:
        return materials["skin"]
    if part.name.endswith("Hand"):
        return materials["glove"]
    if part.name.endswith(("Foot", "ToeBase")):
        return materials["boot"]
    return materials["suit"]


def add_bevel(obj: bpy.types.Object, enabled: bool, width: float = 0.012) -> None:
    if not enabled:
        return
    modifier = obj.modifiers.new("Softened low-poly edges", "BEVEL")
    modifier.width = width
    modifier.segments = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def closed_loft_faces(ring_count: int, sides: int, start: int = 0) -> list[tuple[int, ...]]:
    """Connect equal-sized vertex rings and cap both ends."""
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(start, start + sides)))
    ]
    for ring in range(ring_count - 1):
        lower = start + ring * sides
        upper = lower + sides
        for side in range(sides):
            nxt = (side + 1) % sides
            faces.append((lower + side, lower + nxt, upper + nxt, upper + side))
    top = start + (ring_count - 1) * sides
    faces.append(tuple(top + side for side in range(sides)))
    return faces


def create_mesh_object(
    part: Part,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    *,
    local_coordinates: bool,
) -> bpy.types.Object:
    """Create and link one mesh object for one body part."""
    mesh = bpy.data.meshes.new(f"{part.name}Shape")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()

    obj = bpy.data.objects.new(f"Part_{part.name}", mesh)
    bpy.context.collection.objects.link(obj)
    if local_coordinates:
        obj.location = part.center
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    return obj


def shade_smooth(obj: bpy.types.Object) -> None:
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def connected_face_shells(bm: bmesh.types.BMesh) -> list[list[bmesh.types.BMFace]]:
    """Return the disconnected closed shells in a mesh."""
    unseen = set(bm.faces)
    shells: list[list[bmesh.types.BMFace]] = []
    while unseen:
        seed = unseen.pop()
        shell = [seed]
        stack = [seed]
        while stack:
            face = stack.pop()
            for edge in face.edges:
                for linked in edge.link_faces:
                    if linked in unseen:
                        unseen.remove(linked)
                        shell.append(linked)
                        stack.append(linked)
        shells.append(shell)
    return shells


def shell_signed_volume(faces: list[bmesh.types.BMFace]) -> float:
    """Calculate signed volume by triangulating each polygon as a fan."""
    volume = 0.0
    for face in faces:
        coordinates = [vertex.co for vertex in face.verts]
        origin = coordinates[0]
        for index in range(1, len(coordinates) - 1):
            volume += origin.dot(coordinates[index].cross(coordinates[index + 1])) / 6.0
    return volume


def repair_and_validate_part_mesh(obj: bpy.types.Object, part_name: str) -> None:
    """Make each closed component outward-facing and reject broken topology."""
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        bm.faces.ensure_lookup_table()
        bm.edges.ensure_lookup_table()
        if not bm.faces:
            raise RuntimeError(f"{part_name} has no faces")

        non_manifold = [edge for edge in bm.edges if not edge.is_manifold]
        if non_manifold:
            raise RuntimeError(f"{part_name} has {len(non_manifold)} non-manifold edges")

        # The head and nose are separate shells, so validate each independently.
        for index, shell in enumerate(connected_face_shells(bm)):
            bmesh.ops.recalc_face_normals(bm, faces=shell)
            bm.normal_update()
            signed_volume = shell_signed_volume(shell)
            if signed_volume < 0.0:
                bmesh.ops.reverse_faces(bm, faces=shell)
                bm.normal_update()
                signed_volume = -signed_volume
            if signed_volume <= 1e-10:
                raise RuntimeError(
                    f"{part_name} shell {index} has zero or invalid volume "
                    f"({signed_volume:.12g})"
                )

        bm.to_mesh(obj.data)
        obj.data.update()
    finally:
        bm.free()


def build_torso_mesh(
    part: Part,
    profile: tuple[tuple[float, float, float, float], ...],
    bevel: bool,
) -> bpy.types.Object:
    """Create an asymmetric torso loft; negative Y is the character's front."""
    sx, sy, sz = part.size
    sides = 12
    vertices: list[tuple[float, float, float]] = []
    for z_factor, x_factor, y_factor, y_offset in profile:
        z = z_factor * sz
        hx = sx * x_factor * 0.5
        hy = sy * y_factor * 0.5
        for side in range(sides):
            angle = 2.0 * math.pi * side / sides
            vertices.append((math.cos(angle) * hx, y_offset * sy + math.sin(angle) * hy, z))

    obj = create_mesh_object(
        part,
        vertices,
        closed_loft_faces(len(profile), sides),
        local_coordinates=True,
    )
    add_bevel(obj, bevel, min(part.size) * 0.08)
    shade_smooth(obj)
    return obj


def build_head_mesh(part: Part, bevel: bool) -> bpy.types.Object:
    """Create a head with distinct cranium, face plane, jaw, chin, and nose."""
    sx, sy, sz = part.size
    rings = (
        (-0.50, 0.30, 0.30, -0.06),
        (-0.39, 0.56, 0.48, -0.09),
        (-0.22, 0.76, 0.62, -0.08),
        (-0.02, 0.87, 0.72, -0.04),
        (0.18, 0.92, 0.80, 0.00),
        (0.34, 0.98, 0.94, 0.065),
        (0.46, 0.80, 0.80, 0.055),
        (0.50, 0.45, 0.45, 0.035),
        (0.52, 0.12, 0.12, 0.015),
    )
    sides = 14
    vertices: list[tuple[float, float, float]] = []
    for z_factor, x_factor, y_factor, y_offset in rings:
        for side in range(sides):
            angle = 2.0 * math.pi * side / sides
            vertices.append(
                (
                    math.cos(angle) * sx * x_factor * 0.5,
                    (y_offset + math.sin(angle) * y_factor * 0.5) * sy,
                    z_factor * sz,
                )
            )

    faces = closed_loft_faces(len(rings), sides)

    # A small integrated wedge gives the otherwise abstract head a readable face.
    nose_start = len(vertices)
    nose_y = -sy * 0.40
    vertices.extend(
        (
            (-sx * 0.055, nose_y, -sz * 0.055),
            (sx * 0.055, nose_y, -sz * 0.055),
            (sx * 0.050, nose_y, sz * 0.065),
            (-sx * 0.050, nose_y, sz * 0.065),
            (0.0, -sy * 0.53, -sz * 0.005),
        )
    )
    a, b, c, d, tip = range(nose_start, nose_start + 5)
    faces.extend(((a, b, c, d), (a, tip, b), (b, tip, c), (c, tip, d), (d, tip, a)))

    obj = create_mesh_object(part, vertices, faces, local_coordinates=True)
    add_bevel(obj, bevel, 0.009)
    shade_smooth(obj)
    return obj


def build_shoulder_mesh(part: Part) -> bpy.types.Object:
    """Create a closed shoulder volume without loft caps that can collapse."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=part.center)
    obj = bpy.context.object
    obj.name = f"Part_{part.name}"
    obj.scale = tuple(dimension * 0.5 for dimension in part.size)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    shade_smooth(obj)
    return obj


def build_limb_mesh(
    part: Part,
    profile: tuple[tuple[float, float, float, float], ...],
    bevel: bool,
) -> bpy.types.Object:
    """Loft an anatomical limb along its bone instead of scaling a cylinder."""
    direction = Vector(part.bone_tail) - Vector(part.bone_head)
    axis = direction.normalized()
    along_x = part.size[0] > part.size[2]
    if along_x:
        cross_a, cross_b, length = part.size[1], part.size[2], part.size[0]
        basis_a = Vector((0.0, 1.0, 0.0))
        basis_b = Vector((0.0, 0.0, 1.0))
    else:
        cross_a, cross_b, length = part.size[0], part.size[1], part.size[2]
        basis_a = Vector((1.0, 0.0, 0.0))
        basis_b = Vector((0.0, 1.0, 0.0))

    sides = 10
    center = Vector(part.center)
    # Reverse the ring order when the chosen cross-section basis is left-handed
    # relative to the bone direction (right limbs and downward leg chains).
    winding = 1.0 if basis_a.cross(basis_b).dot(axis) >= 0.0 else -1.0
    vertices: list[tuple[float, float, float]] = []
    for axis_factor, a_factor, b_factor, b_offset in profile:
        ring_center = center + axis * (axis_factor * length) + basis_b * (b_offset * cross_b)
        for side in range(sides):
            angle = winding * 2.0 * math.pi * side / sides
            point = (
                ring_center
                + basis_a * (math.cos(angle) * cross_a * a_factor * 0.5)
                + basis_b * (math.sin(angle) * cross_b * b_factor * 0.5)
            )
            vertices.append(tuple(point))

    obj = create_mesh_object(
        part,
        vertices,
        closed_loft_faces(len(profile), sides),
        local_coordinates=False,
    )
    add_bevel(obj, bevel, min(cross_a, cross_b) * 0.06)
    shade_smooth(obj)
    return obj


def build_foot_mesh(part: Part, bevel: bool) -> bpy.types.Object:
    """Loft a foot with a visible heel, ankle, instep, ball, and toe."""
    sx, sy, sz = part.size
    toe = part.name.endswith("ToeBase")
    rings = (
        ((0.50, 0.62, 0.82, 0.02), (0.15, 0.88, 1.08, 0.10), (-0.18, 1.00, 0.82, 0.00), (-0.50, 0.84, 0.42, -0.18))
        if not toe
        else ((0.50, 0.88, 0.70, 0.04), (0.05, 1.00, 0.76, 0.00), (-0.50, 0.76, 0.42, -0.12))
    )
    sides = 10
    vertices: list[tuple[float, float, float]] = []
    for y_factor, width_factor, height_factor, z_offset in rings:
        for side in range(sides):
            angle = 2.0 * math.pi * side / sides
            vertices.append(
                (
                    math.cos(angle) * sx * width_factor * 0.5,
                    y_factor * sy,
                    z_offset * sz + math.sin(angle) * sz * height_factor * 0.5,
                )
            )
    obj = create_mesh_object(
        part,
        vertices,
        closed_loft_faces(len(rings), sides),
        local_coordinates=True,
    )
    add_bevel(obj, bevel, min(part.size) * 0.06)
    shade_smooth(obj)
    return obj


TORSO_PROFILES = {
    # Last value offsets each ring along Y to shape belly, back, and butt.
    "Hips": ((-0.50, 0.70, 0.72, 0.08), (-0.12, 1.00, 1.00, 0.09), (0.50, 0.82, 0.84, 0.02)),
    "Spine": ((-0.50, 0.92, 0.94, -0.01), (0.00, 1.04, 1.12, -0.12), (0.50, 0.88, 0.92, -0.04)),
    "Spine1": ((-0.50, 0.96, 0.96, -0.03), (0.05, 0.98, 1.02, -0.04), (0.50, 0.91, 0.92, 0.00)),
    "Spine2": ((-0.50, 0.88, 0.90, 0.00), (0.15, 1.00, 1.02, -0.04), (0.50, 0.82, 0.86, 0.01)),
}


LIMB_PROFILES = {
    "Neck": ((-0.50, 0.78, 0.82, 0.03), (0.05, 1.00, 1.00, 0.00), (0.50, 0.80, 0.82, -0.05)),
    "Arm": ((-0.50, 0.88, 0.88, -0.03), (-0.15, 1.00, 1.00, -0.05), (0.20, 0.88, 0.90, -0.04), (0.50, 0.72, 0.74, 0.00)),
    "ForeArm": ((-0.50, 0.72, 0.74, 0.00), (-0.10, 1.00, 1.00, -0.03), (0.22, 0.88, 0.90, -0.02), (0.50, 0.62, 0.64, 0.00)),
    "Hand": ((-0.50, 0.66, 0.68, 0.00), (-0.20, 1.00, 1.00, -0.06), (0.22, 0.86, 0.88, -0.05), (0.50, 0.52, 0.50, 0.00)),
    "UpLeg": ((-0.50, 0.94, 0.96, 0.08), (-0.18, 1.00, 1.04, 0.06), (0.18, 0.90, 0.94, 0.02), (0.50, 0.70, 0.72, -0.03)),
    "Leg": ((-0.50, 0.68, 0.70, -0.02), (-0.34, 0.86, 0.98, 0.10), (-0.18, 0.92, 1.04, 0.12), (0.50, 0.56, 0.60, 0.00)),
}


def limb_profile(part_name: str) -> tuple[tuple[float, float, float, float], ...]:
    for suffix in ("ForeArm", "UpLeg", "Hand", "Arm", "Leg", "Neck"):
        if part_name.endswith(suffix):
            return LIMB_PROFILES[suffix]
    raise KeyError(f"No anatomical profile for {part_name}")


def build_part(
    part: Part,
    materials: dict[str, bpy.types.Material],
    prefix: str,
    bevel: bool,
) -> bpy.types.Object:
    """Build, validate, shade, and weight exactly one body part."""
    if part.shape == "torso":
        obj = build_torso_mesh(part, TORSO_PROFILES[part.name], bevel)
    elif part.shape == "head":
        obj = build_head_mesh(part, bevel)
    elif part.shape == "shoulder":
        obj = build_shoulder_mesh(part)
    elif part.shape == "foot":
        obj = build_foot_mesh(part, bevel)
    elif part.shape == "limb":
        obj = build_limb_mesh(part, limb_profile(part.name), bevel)
    else:
        raise ValueError(f"Unknown shape {part.shape!r} for {part.name}")

    repair_and_validate_part_mesh(obj, part.name)
    obj.data.materials.append(material_for_part(part, materials))
    group = obj.vertex_groups.new(name=bone_name(part.name, prefix))
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
    return obj


def build_parts(prefix: str, bevel: bool) -> list[bpy.types.Object]:
    """Build all body-part objects in specification order."""
    materials = create_materials()
    return [build_part(part, materials, prefix, bevel) for part in PARTS]


def assemble_parts(parts: list[bpy.types.Object]) -> bpy.types.Object:
    """Join the rigid parts into the single skinned mesh expected by FBX."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    character = bpy.context.object
    character.name = "StylizedCharacter"
    character.data.name = "StylizedCharacterMesh"
    return character


def build_armature(prefix: str) -> bpy.types.Object:
    armature_data = bpy.data.armatures.new("StylizedCharacterRig")
    armature = bpy.data.objects.new("Armature", armature_data)
    bpy.context.collection.objects.link(armature)
    armature.show_in_front = True
    armature.data.display_type = "STICK"

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    edit_bones: dict[str, bpy.types.EditBone] = {}
    for part in PARTS:
        name = bone_name(part.name, prefix)
        edit_bone = armature.data.edit_bones.new(name)
        edit_bone.head = part.bone_head
        edit_bone.tail = part.bone_tail
        edit_bone.use_deform = True
        edit_bones[part.name] = edit_bone

    for part in PARTS:
        if part.parent:
            edit_bones[part.name].parent = edit_bones[part.parent]
            # The shoulders and thighs branch away from the parent's tail, so
            # preserve exact joint positions instead of forcing connected bones.
            edit_bones[part.name].use_connect = False

    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def bind_character(character: bpy.types.Object, armature: bpy.types.Object) -> None:
    modifier = character.modifiers.new("Armature", "ARMATURE")
    modifier.object = armature
    modifier.use_vertex_groups = True
    character.parent = armature
    character.matrix_parent_inverse = armature.matrix_world.inverted()


def validate_scene(character: bpy.types.Object, armature: bpy.types.Object, prefix: str) -> None:
    expected = {bone_name(part.name, prefix) for part in PARTS}
    actual_bones = set(armature.data.bones.keys())
    actual_groups = set(character.vertex_groups.keys())
    if actual_bones != expected or actual_groups != expected:
        raise RuntimeError("Bone/vertex-group names do not match the body-part specification")
    if len(character.data.vertices) == 0:
        raise RuntimeError("Generated character has no vertices")
    for vertex in character.data.vertices:
        total = sum(group.weight for group in vertex.groups)
        if not math.isclose(total, 1.0, abs_tol=1e-6):
            raise RuntimeError(f"Vertex {vertex.index} has total skin weight {total}, expected 1.0")


def export_fbx(output: Path, character: bpy.types.Object, armature: bpy.types.Object) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    character.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature

    bpy.ops.export_scene.fbx(
        filepath=str(output),
        check_existing=False,
        use_selection=True,
        object_types={"ARMATURE", "MESH"},
        use_mesh_modifiers=True,
        add_leaf_bones=False,
        use_armature_deform_only=True,
        armature_nodetype="NULL",
        bake_anim=False,
        axis_forward="-Z",
        axis_up="Y",
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_UNITS",
        path_mode="AUTO",
        embed_textures=False,
    )


def main() -> None:
    args = parse_args()
    output = Path(args.output).expanduser().resolve()
    prefix = "" if args.no_prefix else "mixamorig:"

    reset_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    part_objects = build_parts(prefix, bevel=not args.no_bevel)
    character = assemble_parts(part_objects)
    armature = build_armature(prefix)
    bind_character(character, armature)
    validate_scene(character, armature, prefix)

    if args.blend:
        blend_path = Path(args.blend).expanduser().resolve()
        blend_path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    export_fbx(output, character, armature)
    print(
        f"Generated {output} with {len(PARTS)} rigid body parts, "
        f"{len(armature.data.bones)} deform bones, and {len(character.data.vertices)} vertices."
    )


if __name__ == "__main__":
    main()
