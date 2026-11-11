"""Blender --factory-startup --background --python this.py -- --root FRONTEND.
Transfer the two authored body displacements to a copy of the original shirt.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import struct
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

p = argparse.ArgumentParser()
p.add_argument('--root', type=Path, required=True)
p.add_argument('--version', choices=['v1', 'v2'], default='v1')
options = p.parse_args(sys.argv[sys.argv.index('--')+1:])
root = options.root.resolve()
version = options.version
models = root / 'public/models'
original = models / 'ONFIT_TShirt.glb'
human = models / 'ONFIT_Human_BodyMorph_v1.glb'
output = models / f'ONFIT_TShirt_BodyMorph_{version}.glb'
blend = root.parent / f'assets/blender/ONFIT_TShirt_BodyMorph_{version}.blend'
report_path = output.with_suffix('.json')
if any(f.exists() for f in [output, blend, report_path]):
    raise RuntimeError('Existing outputs must be preserved; refusing overwrite')
sha = lambda f: hashlib.sha256(f.read_bytes()).hexdigest()
hashes = {str(f): sha(f) for f in [original, human]}
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
def import_mesh(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [o for o in set(bpy.data.objects)-before if o.type == 'MESH']
    assert len(meshes) == 1
    return meshes[0]
body = import_mesh(human)
shirt = import_mesh(original)
assert body.matrix_world == shirt.matrix_world, 'Assets must share coordinate frame'
assert not shirt.modifiers and shirt.data.shape_keys is None
mesh = shirt.data
uv = [tuple(v.uv) for v in mesh.uv_layers.active.data]
polygons = [tuple(f.vertices) for f in mesh.polygons]
base = np.array([v.co[:] for v in mesh.vertices])
original_base = base.copy()
body_keys = body.data.shape_keys.key_blocks
body_base = np.array([v.co[:] for v in body_keys[0].data])
for k in list(body_keys)[1:]:
    body_base += k.value * (np.array([v.co[:] for v in k.data])-np.array([v.co[:] for v in body_keys[0].data]))
body.data.calc_loop_triangles()
tri = [tuple(t.vertices) for t in body.data.loop_triangles]
body_delta = {name: np.array([v.co[:] for v in body_keys[name].data])-np.array([v.co[:] for v in body_keys[0].data])
              for name in ['abdomen_front', 'pelvis_width']}
tree = BVHTree.FromPolygons([Vector(v) for v in body_base], tri, all_triangles=True)
deltas = {name: np.zeros_like(base) for name in body_delta}
for i, point in enumerate(base):
    near, normal, face, distance = tree.find_nearest(Vector(point))
    ids = tri[face]
    # Add a small baseline gap only where original cloth is inside/too near skin.
    signed = (Vector(point)-near).dot(normal)
    if signed < .004:
        base[i] += np.array(normal) * min(.016, .004-signed)
    for name, delta in body_delta.items():
        d = barycentric_transform(near, *(Vector(body_base[j]) for j in ids), *(Vector(delta[j]) for j in ids))
        deltas[name][i] = d

old_deltas = {name: delta.copy() for name, delta in deltas.items()}
if version == 'v2':
    def smooth(a, b, values):
        t = np.clip((values-a)/(b-a),0,1)
        return t*t*(3-2*t)
    # Small distributed torso ease, rather than isolated per-vertex pushes.
    x, y, z = base.T.copy()
    ease = .008 * (1-smooth(1.075,1.15,z)) * (1-smooth(.24,.30,np.abs(x)))
    radial = np.column_stack([x, y+.02])
    radial /= np.maximum(np.linalg.norm(radial,axis=1)[:,None],1e-9)
    base[:,:2] += radial*ease[:,None]
    x, y, z = base.T
    # Cloth drapes past the belly towards the hem instead of copying the body's
    # compact bump, which drops back to zero immediately below the abdomen.
    # Continuous cubic weights expand the load across the front and side panels.
    deltas['abdomen_front'][:] = 0
    deltas['abdomen_front'][:,1] = (-.09 * (1-smooth(1.075,1.30,z))
        * (1-smooth(.10,.28,np.abs(x))) * (1-smooth(-.075,.045,y)))
    deltas['pelvis_width'][:] = 0
    deltas['pelvis_width'][:,0] = (.025 * np.clip(x/.16,-1,1)
        * (1-smooth(.91,1.08,z)) * (1-smooth(.23,.30,np.abs(x))))

# No new topology: preserve imported vertex/loop ordering, UV and materials.
for i, v in enumerate(mesh.vertices): v.co = base[i]
shirt.shape_key_add(name='Basis', from_mix=False)
for name, delta in deltas.items():
    k = shirt.shape_key_add(name='garment_'+name, from_mix=False)
    k.slider_min = -1 if name == 'pelvis_width' else 0
    k.value = 0
    for i, v in enumerate(k.data): v.co = base[i]+delta[i]
mesh.calc_loop_triangles()
shirt_tri = np.array([t.vertices[:] for t in mesh.loop_triangles])
def face_normals(points):
    return np.cross(points[shirt_tri[:, 1]]-points[shirt_tri[:, 0]], points[shirt_tri[:, 2]]-points[shirt_tri[:, 0]])
n0 = face_normals(base)
checks = []
for a, w in [(0, 0), (.5, 0), (1, 0), (0, -1), (1, -1), (0, 1), (1, 1), (0, 0)]:
    body_points = body_base + a*body_delta['abdomen_front'] + w*body_delta['pelvis_width']
    cloth = base + a*deltas['abdomen_front'] + w*deltas['pelvis_width']
    surface = BVHTree.FromPolygons([Vector(v) for v in body_points], tri, all_triangles=True)
    signed = []
    for point in cloth:
        q, n, _, _ = surface.find_nearest(Vector(point))
        signed.append((Vector(point)-q).dot(n))
    normals = face_normals(cloth)
    valid = np.linalg.norm(n0, axis=1) > 1e-12
    flipped = int(np.sum(np.sum(normals[valid]*n0[valid], axis=1) <= 0))
    assert flipped == 0, f'Flipped cloth triangles: {flipped}'
    cloth_tree = BVHTree.FromPolygons([Vector(v) for v in cloth], shirt_tri.tolist(), all_triangles=True)
    # Filter adjacency including UV-seam duplicates before counting candidates.
    welded = [tuple(np.round(v,5)) for v in base]
    face_sets = [set(welded[i] for i in t) for t in shirt_tri]
    self_candidates = sum(i<j and not (face_sets[i] & face_sets[j]) for i,j in cloth_tree.overlap(cloth_tree))
    checks.append({'abdomen': a, 'pelvis': w, 'samples': len(signed),
        'inside_over_2mm': sum(d < -.002 for d in signed),
        'inside_over_10mm': sum(d < -.01 for d in signed),
        'min_signed_gap_m': min(signed), 'flipped_triangles': flipped,
        'body_triangle_overlap_pairs': len(surface.overlap(cloth_tree)),
        'self_nonadjacent_overlap_candidates': self_candidates})
assert polygons == [tuple(f.vertices) for f in mesh.polygons]
assert uv == [tuple(v.uv) for v in mesh.uv_layers.active.data]
assert all(sha(Path(f)) == h for f, h in hashes.items())
shirt.name = f'ONFIT_TShirt_BodyMorph_{version}'
bpy.ops.object.select_all(action='DESELECT')
shirt.select_set(True)
bpy.context.view_layer.objects.active = shirt
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
# Preserve the original GLB vertex/index/UV layout exactly. Blender's generic
# exporter re-splits some normal seams when exporting morphs. Write bpy-authored
# displacements into new accessors instead of allowing that topology rewrite.
raw = original.read_bytes()
json_size = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20+json_size])
binary_size = struct.unpack_from('<I', raw, 20+json_size)[0]
binary = bytearray(raw[28+json_size:28+json_size+binary_size])
primitive = doc['meshes'][0]['primitives'][0]
def read_accessor(index):
    a = doc['accessors'][index]; view = doc['bufferViews'][a['bufferView']]
    assert a['componentType'] == 5126 and a['type'] == 'VEC3'
    start = view.get('byteOffset', 0)+a.get('byteOffset', 0)
    stride = view.get('byteStride', 12)
    return np.array([struct.unpack_from('<3f', binary, start+i*stride) for i in range(a['count'])])
to_gltf = lambda values: np.column_stack([values[:,0], values[:,2], -values[:,1]])
original_positions = read_accessor(primitive['attributes']['POSITION'])
assert np.allclose(original_positions, to_gltf(original_base), atol=1e-7), 'Import reordered vertices'
position_accessor = doc['accessors'][primitive['attributes']['POSITION']]
view = doc['bufferViews'][position_accessor['bufferView']]
start = view.get('byteOffset', 0)+position_accessor.get('byteOffset', 0)
for i, point in enumerate(to_gltf(base)):
    struct.pack_into('<3f', binary, start+i*view.get('byteStride',12), *point)
position_accessor['min'] = to_gltf(base).min(axis=0).tolist()
position_accessor['max'] = to_gltf(base).max(axis=0).tolist()
def append_accessor(values):
    values = values.astype('<f4')
    while len(binary)%4: binary.append(0)
    offset = len(binary); binary.extend(values.tobytes())
    doc['bufferViews'].append({'buffer':0, 'byteOffset':offset, 'byteLength':values.nbytes})
    doc['accessors'].append({'bufferView':len(doc['bufferViews'])-1, 'componentType':5126,
        'count':len(values), 'type':'VEC3', 'min':values.min(axis=0).tolist(), 'max':values.max(axis=0).tolist()})
    return len(doc['accessors'])-1
def vertex_normals(points):
    normals = np.zeros_like(points)
    face = face_normals(points)
    for axis in range(3): np.add.at(normals, shirt_tri[:,axis], face)
    return normals/np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-12)
reference_normals = vertex_normals(base)
primitive['targets'] = []
for name, delta in deltas.items():
    normal_delta = vertex_normals(base+delta)-reference_normals
    primitive['targets'].append({'POSITION':append_accessor(to_gltf(delta)),
                                 'NORMAL':append_accessor(to_gltf(normal_delta))})
doc['meshes'][0]['extras'] = {'targetNames':['garment_abdomen_front','garment_pelvis_width']}
doc['meshes'][0]['weights'] = [0,0]
doc['buffers'][0]['byteLength'] = len(binary)
encoded = json.dumps(doc, separators=(',',':')).encode('utf8')
encoded += b' ' * (-len(encoded)%4)
binary += b'\x00' * (-len(binary)%4)
output.write_bytes(struct.pack('<III',0x46546c67,2,12+8+len(encoded)+8+len(binary))+
    struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary)
report = {'original_hashes': hashes, 'output_sha256': sha(output), 'blend': str(blend),
    'vertices': len(base), 'triangles': len(shirt_tri), 'uv_preserved': True, 'topology_preserved': True,
    'baseline_max_correction_m': float(np.linalg.norm(base-original_base, axis=1).max()),
    'morph_targets': ['garment_abdomen_front', 'garment_pelvis_width'],
    'checks': checks, 'visual_verification': False,
    'method': 'Smooth front-to-hem drape envelope' if version == 'v2' else 'Nearest body triangle barycentric displacement transfer',
    'limitations': 'Nearest-surface vertex gaps do not prove triangle collision absence; visual fit and seam/neck/hem need inspection'}
edges = np.array([e.vertices[:] for e in mesh.edges])
length = np.linalg.norm(base[edges[:,0]]-base[edges[:,1]], axis=1)
valid_edges = length > 1e-6
def slope(delta):
    slopes = np.linalg.norm(delta[edges[:,0]]-delta[edges[:,1]],axis=1)[valid_edges]/length[valid_edges]
    return {'max':float(slopes.max()), 'p95':float(np.percentile(slopes,95))}
report['abdomen_displacement_slope'] = {'v1':slope(old_deltas['abdomen_front']), 'current':slope(deltas['abdomen_front'])}
report_path.write_text(json.dumps(report, indent=2), encoding='utf8')
print('ONFIT_GARMENT_MORPHS', json.dumps(report))
