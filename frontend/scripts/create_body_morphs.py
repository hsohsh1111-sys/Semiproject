"""Blender --factory-startup --background SOURCE.blend --python this.py -- --root FRONTEND.
v1 creates abdomen/pelvis; v2 adds shoulder/chest/waist to the v1 BLEND.
v3 adds hip/thigh to the v2 BLEND.
These are artistic, region-limited morphs; inputs are never overwritten.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import itertools
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

parser = argparse.ArgumentParser()
parser.add_argument('--root', type=Path, required=True)
parser.add_argument('--version', choices=['v1','v2','v3'], default='v1')
options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
root = options.root.resolve()
version = options.version
source = Path(bpy.data.filepath)
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
source_hash = digest(source)
output = root / f'public/models/ONFIT_Human_BodyMorph_{version}.glb'
blend = root.parent / f'assets/blender/ONFIT_Human_BodyMorph_{version}.blend'
report_path = output.with_suffix('.json')
if any(p.exists() for p in [output, blend, report_path]):
    raise RuntimeError('Refusing to overwrite existing outputs')
body = bpy.data.objects['Human']
keys = body.data.shape_keys.key_blocks
old = {k.name: (k.value, np.array([p.co[:] for p in k.data])) for k in keys}
topology = [tuple(p.vertices) for p in body.data.polygons]
mask = next(m for m in body.modifiers if m.type == 'MASK')
assert mask.vertex_group == 'body' and not mask.invert_vertex_group
group = body.vertex_groups['body']
keep = np.array([any(g.group == group.index and g.weight > mask.threshold for g in v.groups)
                 for v in body.data.vertices])
basis = np.array([p.co[:] for p in keys[0].data])
reference = basis.copy()
for key in list(keys)[1:]:
    assert key.relative_key == keys[0]
    reference += key.value * (np.array([p.co[:] for p in key.data]) - basis)
x, y, z = reference.T  # Blender X right, -Y front, Z up; meters.

def smooth(a, b, values):
    t = np.clip((values-a)/(b-a), 0, 1)
    return t*t*(3-2*t)

# Compact smooth supports; no topology changes or global scaling.
abdomen = np.zeros_like(reference)
abdomen[:, 1] = (-.08 * smooth(.98, 1.045, z) * (1-smooth(1.09, 1.20, z))
                  * (1-smooth(.085, .17, np.abs(x))) * (1-smooth(-.08, -.015, y)) * keep)
pelvis = np.zeros_like(reference)
pelvis[:, 0] = (.025 * np.clip(x/.16, -1, 1) * smooth(.70, .83, z)
                * (1-smooth(.90, .975, z)) * (1-smooth(.21, .27, np.abs(x))) * keep)
assert not np.any(pelvis[np.abs(x) >= .27])  # Exclude arms/hands at the same height.
assert not np.any(np.any(abdomen != 0, axis=1) & np.any(pelvis != 0, axis=1))
new_deltas = {'abdomen_front': abdomen, 'pelvis_width': pelvis}
if version == 'v2':
    assert 'abdomen_front' in keys and 'pelvis_width' in keys
    shoulder = np.zeros_like(reference)
    shoulder[:,0] = (.015 * np.clip(x/.10,-1,1) * smooth(.065,.20,np.abs(x))
        * np.maximum(smooth(.19,.27,np.abs(x)),smooth(1.20,1.35,z)*(1-smooth(1.43,1.51,z))) * keep)
    chest = np.zeros_like(reference)
    chest_weight = smooth(1.135,1.205,z)*(1-smooth(1.265,1.35,z))*(1-smooth(.18,.25,np.abs(x)))*keep
    chest[:,0] = .008*np.clip(x/.16,-1,1)*chest_weight
    chest[:,1] = -.012*(1-smooth(-.07,.04,y))*chest_weight
    waist = np.zeros_like(reference)
    waist[:,0] = (.012*np.clip(x/.14,-1,1)*smooth(.98,1.045,z)*(1-smooth(1.105,1.18,z))
        *(1-smooth(.21,.28,np.abs(x)))*keep)
    new_deltas = {'shoulder_width':shoulder, 'chest_volume':chest, 'waist_width':waist}
if version == 'v3':
    assert all(name in keys for name in ['shoulder_width','chest_volume','waist_width'])
    hip = np.zeros_like(reference)
    # Posterior-only volume; no lateral pelvis width or anterior abdomen change.
    hip[:,1] = (.018*smooth(.775,.83,z)*(1-smooth(.91,.98,z))*smooth(-.005,.055,y)
        *(1-smooth(.16,.24,np.abs(x)))*keep)
    thigh = np.zeros_like(reference)
    radial = np.column_stack([x-np.sign(x)*.10,y+.005])
    radial /= np.maximum(np.linalg.norm(radial,axis=1)[:,None],1e-9)
    weight = smooth(.43,.50,z)*(1-smooth(.65,.76,z))*(1-smooth(.20,.25,np.abs(x)))*keep
    thigh[:,:2] = .006*radial*weight[:,None]
    # Keep both signs away from the midline: the inner leg cannot move by more
    # than 20% of its initial separation from X=0 in either direction.
    thigh[:,0] = np.clip(thigh[:,0],-.20*np.abs(x),.20*np.abs(x))
    new_deltas = {'hip_volume':hip,'thigh_girth':thigh}
for name, delta in new_deltas.items():
    key = body.shape_key_add(name=name, from_mix=False)
    key.relative_key = keys[0]
    key.slider_min = 0 if name == 'abdomen_front' else -1
    key.slider_max = 1
    key.value = 0
    for i, p in enumerate(key.data):
        p.co = basis[i] + delta[i]

def evaluated_coordinates(a, p):
    keys['abdomen_front'].value = a
    keys['pelvis_width'].value = p
    bpy.context.view_layer.update()
    evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    result = np.array([v.co[:] for v in mesh.vertices])
    mesh.calc_loop_triangles()
    triangles = np.array([t.vertices[:] for t in mesh.loop_triangles])
    evaluated.to_mesh_clear()
    return result, triangles

base, tri = evaluated_coordinates(0, 0)
def normals(points):
    return np.cross(points[tri[:, 1]]-points[tri[:, 0]], points[tri[:, 2]]-points[tri[:, 0]])
base_normals = normals(base)
checks = []
for a, p in [(1, 0), (0, 1), (0, -1), (1, 1), (1, -1)]:
    points, current_tri = evaluated_coordinates(a, p)
    expected = (reference + a*abdomen + p*pelvis)[keep]
    # Blender may choose a different quad diagonal after deformation. Inspect
    # fixed baseline triangles so tessellation choices cannot hide a fold.
    assert len(tri) == len(current_tri)
    assert np.allclose(points, expected, atol=2e-6)
    n = normals(points)
    valid = np.linalg.norm(base_normals, axis=1) > 1e-12
    flipped = int(np.sum(np.sum(n[valid]*base_normals[valid], axis=1) <= 0))
    assert flipped == 0, f'Flipped/collapsed triangles: {flipped}'
    assert np.isfinite(points).all()
    checks.append({'abdomen': a, 'pelvis': p, 'flipped_triangles': flipped,
                   'max_displacement_m': float(np.linalg.norm(points-base, axis=1).max())})
if version in ['v2','v3']:
    welded = [tuple(np.round(p,5)) for p in base]
    faces = [{welded[i] for i in t} for t in tri]
    def intersections(points):
        tree = BVHTree.FromPolygons([Vector(p) for p in points],tri.tolist(),all_triangles=True)
        return {(i,j) for i,j in tree.overlap(tree) if i<j and not faces[i]&faces[j]}
    baseline_crossings = intersections(base)
    # Each signed key independently, plus all combined signed corner states.
    states = [dict(zip(new_deltas, values)) for values in itertools.product([-1,1],repeat=len(new_deltas))]
    states += [{name:sign} for name in new_deltas for sign in [-1,1]]
    for weights in states:
        for a,p in [(0,0),(.8,-1),(.8,1)]:
            for name in new_deltas: keys[name].value = weights.get(name,0)
            points,_ = evaluated_coordinates(a,p)
            valid = np.linalg.norm(base_normals,axis=1)>1e-12
            flipped = int(np.sum(np.sum(normals(points)[valid]*base_normals[valid],axis=1)<=0))
            assert flipped==0, (weights,a,p,flipped)
            introduced = intersections(points)-baseline_crossings
            assert not introduced, (weights,a,p,len(introduced))
            checks.append({'weights':weights,'abdomen':a,'pelvis':p,'flipped_triangles':flipped,
                           'introduced_self_intersections':len(introduced)})
    if version == 'v3':
        for sign in [-1,1]:
            for name in ['shoulder_width','chest_volume','waist_width']:keys[name].value=sign
            for hip_sign,thigh_sign in itertools.product([-1,1],repeat=2):
                keys['hip_volume'].value=hip_sign;keys['thigh_girth'].value=thigh_sign
                points,_=evaluated_coordinates(.8,sign)
                valid=np.linalg.norm(base_normals,axis=1)>1e-12
                flipped=int(np.sum(np.sum(normals(points)[valid]*base_normals[valid],axis=1)<=0))
                introduced=intersections(points)-baseline_crossings
                assert flipped==0 and not introduced,(sign,hip_sign,thigh_sign,flipped,len(introduced))
                checks.append({'upper_sign':sign,'hip':hip_sign,'thigh':thigh_sign,
                               'flipped_triangles':flipped,'introduced_self_intersections':len(introduced)})
        for name in ['shoulder_width','chest_volume','waist_width']:keys[name].value=0
    for name in new_deltas: keys[name].value = 0
restored, _ = evaluated_coordinates(0, 0)
assert np.array_equal(restored, base)
for name, (value, coords) in old.items():
    assert keys[name].value == value
    assert np.array_equal(np.array([p.co[:] for p in keys[name].data]), coords)
assert topology == [tuple(p.vertices) for p in body.data.polygons]

blend.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
# Export-only duplicate uses the SAME existing helper MASK as BodyOnly export.
# Full authoring mesh, original key arrays and vertex ordering remain in BLEND.
working = body.copy()
working.data = body.data.copy()
working.name = f'ONFIT_Human_BodyMorph_{version}'
bpy.context.scene.collection.objects.link(working)
bpy.ops.object.select_all(action='DESELECT')
working.select_set(True)
bpy.context.view_layer.objects.active = working
working.active_shape_key_index = 0
for m in working.modifiers:
    m.show_viewport = m.show_render = False
for p in working.data.polygons: p.select = False
for e in working.data.edges: e.select = False
for v in working.data.vertices: v.select = not bool(keep[v.index])
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='VERT')
bpy.ops.object.mode_set(mode='OBJECT')
for m in list(working.modifiers): working.modifiers.remove(m)
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
    export_apply=False, export_morph=True, export_morph_normal=True, export_animations=False)
assert digest(source) == source_hash
report = {'source': str(source), 'source_sha256': source_hash, 'glb_sha256': digest(output),
    'blend': str(blend), 'authoring_vertices': len(body.data.vertices),
    'export_vertices': len(working.data.vertices), 'original_weights': {n: v for n, (v, _) in old.items()},
    'new_weights': {name:0 for name in new_deltas},
    'changed_vertices': {name:int(np.any(delta!=0,axis=1).sum()) for name,delta in new_deltas.items()},
    'max_axis_displacement_m':{name:np.abs(delta).max(axis=0).tolist() for name,delta in new_deltas.items()},
    'overlapping_support_vertices': 0, 'restored_exactly': True, 'checks': checks,
    'abdomen_max_m': float(-abdomen[:, 1].min()), 'pelvis_half_width_max_m': float(abs(pelvis[:, 0]).max()),
    'limitations': 'Artistic local morphs, not measured body reconstruction; normal checks do not prove no self-intersection; clothing static.',
    'visual_verification': False}
report_path.write_text(json.dumps(report, indent=2), encoding='utf8')
print('ONFIT_BODY_MORPHS', json.dumps(report))
