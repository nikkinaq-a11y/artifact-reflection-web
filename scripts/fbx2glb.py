"""Convert an FBX (with embedded textures) to GLB via Blender headless.

Usage:
    blender --background --factory-startup --python scripts/fbx2glb.py -- <in.fbx> <out.glb>

Used for the Phase 1 prototype artifact and the Phase 5 seed bake. The in-app import
path (Phase 2) uses three.js FBXLoader directly and does not depend on this.
"""

import sys
import os

import bpy


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:]
    if len(argv) != 2:
        raise SystemExit("expected: <in.fbx> <out.glb>")
    src, dst = os.path.abspath(argv[0]), os.path.abspath(argv[1])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=src)

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=dst,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        # Embedded FBX textures land in the blend as packed images; keep them packed
        # into the GLB so the result stays a single self-contained file.
        export_image_format="AUTO",
    )

    print(f"[fbx2glb] wrote {dst} ({os.path.getsize(dst) / 1048576:.1f} MB)")


main()