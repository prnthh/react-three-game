#!/usr/bin/env python3
"""Embed named animation-only FBX files into a rigged character FBX.

Run through Blender from the repository root:

    blender --background --python scripts/embed_fbx_animations.py -- \
      --character docs/public/models/human/mixamo-anatomical-character.fbx \
      --clip idle=docs/public/models/human/anim/idle.fbx \
      --clip walk=docs/public/models/human/anim/walk.fbx
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import bpy


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--character", required=True, type=Path)
    parser.add_argument(
        "--clip",
        action="append",
        required=True,
        metavar="NAME=PATH",
        help="Animation stack name and animation-only FBX path.",
    )
    return parser.parse_args(arguments)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def import_fbx(path: Path) -> tuple[list[bpy.types.Object], list[bpy.types.Action]]:
    objects_before = set(bpy.data.objects)
    actions_before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=str(path))
    objects = [obj for obj in bpy.data.objects if obj not in objects_before]
    actions = [action for action in bpy.data.actions if action not in actions_before]
    return objects, actions


def only_armature(objects: list[bpy.types.Object], source: Path) -> bpy.types.Object:
    armatures = [obj for obj in objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"Expected one armature in {source}, found {len(armatures)}")
    return armatures[0]


def remove_objects(objects: list[bpy.types.Object]) -> None:
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)


def parse_clip(value: str) -> tuple[str, Path]:
    name, separator, path = value.partition("=")
    if not separator or not name.strip() or not path.strip():
        raise ValueError(f'Invalid --clip "{value}"; expected NAME=PATH')
    return name.strip(), Path(path).expanduser().resolve()


def main() -> None:
    args = parse_args()
    character_path = args.character.expanduser().resolve()
    clips = [parse_clip(value) for value in args.clip]
    expected_names = [name for name, _ in clips]
    if len(set(expected_names)) != len(expected_names):
        raise RuntimeError("Animation clip names must be unique")

    reset_scene()
    character_objects, character_actions = import_fbx(character_path)
    if character_actions:
        raise RuntimeError(f"Character already contains animation actions: {[action.name for action in character_actions]}")
    character_armature = only_armature(character_objects, character_path)
    character_bones = {bone.name for bone in character_armature.data.bones}

    imported_actions: list[bpy.types.Action] = []
    for name, clip_path in clips:
        clip_objects, clip_actions = import_fbx(clip_path)
        clip_armature = only_armature(clip_objects, clip_path)
        clip_bones = {bone.name for bone in clip_armature.data.bones}
        if clip_bones != character_bones:
            missing = sorted(character_bones - clip_bones)
            extra = sorted(clip_bones - character_bones)
            raise RuntimeError(f"Skeleton mismatch for {clip_path}; missing={missing}, extra={extra}")
        if len(clip_actions) != 1:
            raise RuntimeError(f"Expected one action in {clip_path}, found {len(clip_actions)}")

        action = clip_actions[0]
        action.name = name
        action.use_fake_user = True
        imported_actions.append(action)
        remove_objects(clip_objects)

    character_armature.animation_data_create()
    character_armature.animation_data.action = None
    for action in imported_actions:
        track = character_armature.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, int(action.frame_range[0]), action)
        strip.name = action.name

    bpy.ops.object.select_all(action="DESELECT")
    for obj in character_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = character_armature

    temporary_path = character_path.with_name(f".{character_path.stem}.animated.tmp.fbx")
    bpy.ops.export_scene.fbx(
        filepath=str(temporary_path),
        check_existing=False,
        use_selection=True,
        object_types={"ARMATURE", "MESH"},
        use_mesh_modifiers=True,
        add_leaf_bones=False,
        use_armature_deform_only=True,
        armature_nodetype="NULL",
        bake_anim=True,
        bake_anim_use_all_bones=True,
        bake_anim_use_nla_strips=True,
        bake_anim_use_all_actions=False,
        bake_anim_force_startend_keying=True,
        axis_forward="-Z",
        axis_up="Y",
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_UNITS",
        path_mode="AUTO",
        embed_textures=False,
    )

    reset_scene()
    _, validated_actions = import_fbx(temporary_path)
    actual_names = [action.name.rsplit("|", 1)[-1] for action in validated_actions]
    if set(actual_names) != set(expected_names):
        temporary_path.unlink(missing_ok=True)
        raise RuntimeError(f"Exported animation stacks {actual_names}, expected {expected_names}")

    os.replace(temporary_path, character_path)
    print(f"Embedded animation stacks {expected_names} into {character_path}")


if __name__ == "__main__":
    main()
