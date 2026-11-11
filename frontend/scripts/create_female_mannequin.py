"""Export a separate MPFB female mannequin; never overwrite source assets.
Run with Blender on ONFIT_Human_BodyBuild_v11.blend, then -- --root FRONTEND.
Uses the real MPFB female gender/macro targets, not a relabeled male mesh.
"""
import argparse
import gzip
import hashlib
import json
import sys
from pathlib import Path
import bpy
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('--root', type=Path, required=True)
parser.add_argument('--version', default='v2')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
root = args.root.resolve()
source = Path(bpy.data.filepath)
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
original_hash = digest(source)
output = root / f'public/models/ONFIT_Human_Female_{args.version}.glb'
blend = root.parent / f'assets/blender/ONFIT_Human_Female_{args.version}.blend'
report = output.with_suffix('.json')
assert not any(p.exists() for p in (output, blend, report)), 'Refusing overwrite'
body = bpy.data.objects['Human']
keys = body.data.shape_keys.key_blocks
basis = np.array([v.co[:] for v in keys[0].data])
original = {k.name: np.array([v.co[:] for v in k.data]) for k in keys}
before = basis.copy()
for k in list(keys)[1:]:
    before += k.value * (original[k.name] - basis)

# Preserve each race contribution and replace its mixed gender weighting with
# the corresponding actual MPFB female target. Do not rescale body vertices.
for race in ('as', 'ca', 'af'):
    male, female = keys[f'$md-${race}-$ma-$yn'], keys[f'$md-${race}-$fe-$yn']
    total = male.value + female.value
    male.value, female.value = 0, total

# Use the authored MPFB cup-volume target, not chest circumference or an
# arbitrary point extrusion. Keep firmness unchanged; reduce the previous
# all-build flattening slightly so the female silhouette remains rounded.
cup_keys = [k for k in keys if 'maxcup-' in k.name]
assert len(cup_keys) == 1
cup_keys[0].value = .35
keys['body_chest_relief'].value = .5

target_root = Path.home() / 'AppData/Roaming/Blender Foundation/Blender/5.2/extensions/blender_org/mpfb/data/targets/macrodetails'
def target(name):
    result = np.zeros_like(basis)
    for line in gzip.decompress((target_root / name).read_bytes()).decode('utf8').splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        i, x, y, z = line.split()[:4]
        result[int(i)] = [float(x), -float(z), float(y)]
    return result

raw = target('asian-male-young.target.gz')
stored = original['$md-$as-$ma-$yn'] - basis
scale = float(np.sum(raw * stored) / np.sum(raw * raw))
assert np.max(np.abs(raw * scale - stored)) < 1e-5
# Female build variants use female macro data, not the male muscular delta.
for name, muscle, weight, strength in (
    ('body_build_lean', 'min', 'min', .65),
    ('body_build_muscular', 'max', 'average', .65),
):
    delta = target(f'universal-female-young-{muscle}muscle-{weight}weight.target.gz') * scale * strength
    keys[name].data.foreach_set('co', (basis + delta).ravel())
    keys[name].value = 0
keys['body_abdominal_definition'].value = 0

mask = next(m for m in body.modifiers if m.type == 'MASK')
group = body.vertex_groups[mask.vertex_group]
keep = np.array([any(g.group == group.index and g.weight > mask.threshold for g in v.groups) for v in body.data.vertices])
reference = basis.copy()
for k in list(keys)[1:]:
    reference += k.value * (np.array([v.co[:] for v in k.data]) - basis)
assert np.isfinite(reference).all()
assert np.max(np.linalg.norm(reference[keep] - before[keep], axis=1)) > .01
for name in original:
    if name not in ('body_build_lean', 'body_build_muscular'):
        assert np.array_equal(original[name], np.array([v.co[:] for v in keys[name].data]))
assert len(keys) - 1 == 23
bpy.ops.wm.save_as_mainfile(filepath=str(blend))

working = body.copy()
working.data = body.data.copy()
working.name = 'ONFIT_Human_Female_' + args.version
bpy.context.scene.collection.objects.link(working)
bpy.ops.object.select_all(action='DESELECT')
working.select_set(True)
bpy.context.view_layer.objects.active = working
working.active_shape_key_index = 0
for m in working.modifiers:
    m.show_viewport = m.show_render = False
for p in working.data.polygons:
    p.select = False
for e in working.data.edges:
    e.select = False
for v in working.data.vertices:
    v.select = not bool(keep[v.index])
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='VERT')
bpy.ops.object.mode_set(mode='OBJECT')
for m in list(working.modifiers):
    working.modifiers.remove(m)
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
    export_apply=False, export_morph=True, export_morph_normal=True, export_animations=False)
assert digest(source) == original_hash
data = {'source': str(source), 'source_sha256': original_hash, 'output': str(output),
    'glb_sha256': digest(output), 'targets': 23, 'gender': 'MPFB female race targets',
    'default_gender_weights': {k.name: k.value for k in keys if k.name.startswith('$md-')},
    'cup_volume_weight': cup_keys[0].value, 'chest_relief_weight': keys['body_chest_relief'].value,
    'max_gender_change_m': float(np.linalg.norm(reference[keep] - before[keep], axis=1).max()),
    'license': 'CC0 MPFB core targets',
    'limitations': 'Female anatomy is an artistic MPFB preset, not measured reconstruction. Existing clothes need separate fit and browser validation.'}
report.write_text(json.dumps(data, indent=2), encoding='utf8')
print('ONFIT_FEMALE_EXPORT_OK', output, flush=True)
