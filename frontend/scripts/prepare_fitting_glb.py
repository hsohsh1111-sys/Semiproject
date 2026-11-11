"""Run with Blender --factory-startup --background SOURCE.blend --python this.py
-- --output OUTPUT.glb --report REPORT.json --original-glb ORIGINAL.glb.

Export a body-only derivative using the source's existing MASK, preserving shape
keys. Original .blend/.glb files are read only; existing outputs are refused.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


args = argparse.ArgumentParser()
args.add_argument('--output', type=Path, required=True)
args.add_argument('--report', type=Path, required=True)
args.add_argument('--original-glb', type=Path, required=True)
options = args.parse_args(sys.argv[sys.argv.index('--') + 1:])
source_path = Path(bpy.data.filepath)
source_hash = digest(source_path)
original_hash = digest(options.original_glb)
if options.output.exists() or options.report.exists():
    raise RuntimeError('Refusing to overwrite an existing derivative or report')

source = bpy.data.objects.get('Human')
if source is None or source.type != 'MESH':
    raise RuntimeError('Expected Human mesh not found')
masks = [m for m in source.modifiers if m.type == 'MASK' and m.show_viewport]
if len(masks) != 1 or masks[0].mode != 'VERTEX_GROUP' or masks[0].invert_vertex_group:
    raise RuntimeError('Expected one non-inverted vertex-group MASK')
mask = masks[0]
group = source.vertex_groups.get(mask.vertex_group)
if group is None:
    raise RuntimeError('MASK vertex group not found')

evaluated = source.evaluated_get(bpy.context.evaluated_depsgraph_get())
reference = [source.matrix_world @ v.co for v in evaluated.data.vertices]
# Match Blender's standard glTF Y-up export transform.
reference = [(p.x, p.z, -p.y) for p in reference]
reference_bounds = {
    'min': [min(p[axis] for p in reference) for axis in range(3)],
    'max': [max(p[axis] for p in reference) for axis in range(3)],
}
expected_triangles = sum(len(p.vertices) - 2 for p in evaluated.data.polygons)
expected_polygons = len(evaluated.data.polygons)
original_vertex_count = len(source.data.vertices)
defaults = {key.name: key.value for key in source.data.shape_keys.key_blocks if key.name != 'Basis'}

working = source.copy()
working.data = source.data.copy()
working.name = 'ONFIT_Human_BodyOnly'
bpy.context.scene.collection.objects.link(working)
bpy.ops.object.select_all(action='DESELECT')
working.select_set(True)
bpy.context.view_layer.objects.active = working
working.active_shape_key_index = 0
for modifier in working.modifiers:
    modifier.show_viewport = False
    modifier.show_render = False

# Edit-mode topology deletion updates every Shape Key consistently. The selection
# is derived strictly from the existing source mask, not anatomical guesswork.
for polygon in working.data.polygons:
    polygon.select = False
for edge in working.data.edges:
    edge.select = False
for vertex in working.data.vertices:
    keep = any(g.group == group.index and g.weight > mask.threshold for g in vertex.groups)
    vertex.select = not keep
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='VERT')
bpy.ops.object.mode_set(mode='OBJECT')
for modifier in list(working.modifiers):
    working.modifiers.remove(modifier)
if len(working.data.polygons) != expected_polygons:
    raise RuntimeError(f'Body-only polygon count {len(working.data.polygons)} != source MASK {expected_polygons}')
if any(len(k.data) != len(working.data.vertices) for k in working.data.shape_keys.key_blocks):
    raise RuntimeError('Shape Key topology mismatch')
if {k.name: k.value for k in working.data.shape_keys.key_blocks if k.name != 'Basis'} != defaults:
    raise RuntimeError('Default Shape Key weights changed')

options.output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(options.output.resolve()), export_format='GLB',
    use_selection=True, export_apply=False, export_morph=True,
    export_morph_normal=True, export_animations=False,
)
assert digest(source_path) == source_hash
assert digest(options.original_glb) == original_hash
report = {
    'source_blend': source_path.name, 'source_blend_sha256': source_hash,
    'original_glb': options.original_glb.name, 'original_glb_sha256': original_hash,
    'derivative_glb': options.output.name, 'derivative_glb_sha256': digest(options.output),
    'mask_modifier': mask.name, 'mask_group': group.name,
    'hidden_helper_groups': [g.name for g in source.vertex_groups if g.name.startswith('helper-')],
    'source_vertices': original_vertex_count, 'body_vertices': len(working.data.vertices),
    'source_polygons': len(source.data.polygons), 'body_polygons': len(working.data.polygons),
    'body_triangles': expected_triangles, 'body_bounds': reference_bounds,
    'default_weights': defaults,
}
options.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print('ONFIT_BODY_EXPORT', json.dumps(report))
