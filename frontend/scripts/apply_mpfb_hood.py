"""Fit a licensed MPFB hood or cap; preserve originals and export garment only."""
import argparse
import hashlib
import importlib
import json
from pathlib import Path
import sys
import addon_utils
import bpy

args = argparse.ArgumentParser()
args.add_argument('--asset', type=Path, required=True)
args.add_argument('--blend-output', type=Path, required=True)
args.add_argument('--glb-output', type=Path, required=True)
args.add_argument('--headwear', action='store_true')
options = args.parse_args(sys.argv[sys.argv.index('--') + 1:])
source = Path(bpy.data.filepath)
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
source_hash = digest(source)
asset_hash = digest(options.asset)
assert not options.blend_output.exists() and not options.glb_output.exists(), 'Refusing overwrite'
metadata = options.asset.read_text(encoding='utf8')
license_name=next((line.split(maxsplit=2)[-1] for line in metadata.splitlines() if line.startswith('# license ')),None)
author=next((line.split(maxsplit=2)[-1] for line in metadata.splitlines() if line.startswith('# author ')),None)
assert license_name in ['CC_by','CC0'] and author, 'Inspect license before use'
module = 'bl_ext.blender_org.mpfb'
addon_utils.enable(module, default_set=True, persistent=False)
services = importlib.import_module(module + '.services')
body = bpy.data.objects.get('Human')
assert body and services.ObjectService.object_is_basemesh(body)
weights = [(key.name, key.value) for key in body.data.shape_keys.key_blocks]
old_modifiers = set(body.modifiers)
old_groups = set(body.vertex_groups)
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
garment = services.HumanService.add_mhclo_asset(
    str(options.asset.resolve()), body, asset_type='Clothes', subdiv_levels=0,
    material_type='GAMEENGINE', set_up_rigging=False, interpolate_weights=False,
    import_subrig=False, import_weights=False)
for modifier in list(body.modifiers):
    if modifier not in old_modifiers:
        body.modifiers.remove(modifier)
for group in list(body.vertex_groups):
    if group not in old_groups:
        body.vertex_groups.remove(group)
assert weights == [(key.name, key.value) for key in body.data.shape_keys.key_blocks]
world = garment.matrix_world.copy()
garment.parent = None
garment.matrix_world = world
garment.name = 'ONFIT_Cap' if options.headwear else 'ONFIT_HoodedJacket'
deps = bpy.context.evaluated_depsgraph_get()
fitted = bpy.data.meshes.new_from_object(garment.evaluated_get(deps), depsgraph=deps)
garment.data = fitted
for modifier in list(garment.modifiers):
    garment.modifiers.remove(modifier)
for face in fitted.polygons:
    face.use_smooth = True
assert fitted.uv_layers, 'UV missing'
assert not fitted.shape_keys, 'Unexpected garment morphs'
images = []
for material in fitted.materials:
    if material and material.node_tree:
        for node in material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                node.image.pack()
                images.append(node.image.name)
assert images, 'Authored textures missing'
garment['source_asset'] = options.asset.stem
garment['source_author'] = author
garment['source_license_metadata'] = metadata[:1500]
garment['deformation_support'] = 'Static; no ONFIT Morph Targets'
for obj in bpy.context.scene.objects:
    obj.select_set(False)
garment.select_set(True)
bpy.context.view_layer.objects.active = garment
options.blend_output.parent.mkdir(parents=True, exist_ok=True)
options.glb_output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(options.blend_output.resolve()))
bpy.ops.export_scene.gltf(filepath=str(options.glb_output.resolve()), export_format='GLB',
    use_selection=True, export_apply=True, export_animations=False)
assert digest(source) == source_hash and digest(options.asset) == asset_hash
report = dict(asset_name=options.asset.stem, author=author, license=license_name, asset=str(options.asset),
    asset_sha256=asset_hash, source_blend=str(source), source_blend_sha256=source_hash,
    glb_sha256=digest(options.glb_output), vertices=len(fitted.vertices),
    polygons=len(fitted.polygons), uv_layers=len(fitted.uv_layers), images=images,
    morph_targets=0, license_metadata=metadata[:1500], browser_verified=False)
options.blend_output.with_suffix('.source.json').write_text(json.dumps(report, indent=2), encoding='utf8')
print('ONFIT_HOOD_EXPORTED', json.dumps(report))
