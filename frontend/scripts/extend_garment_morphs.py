"""Blender --factory-startup --background --python this.py -- FRONTEND.
Append three bpy-authored garment morphs without rewriting v2 geometry/UVs.
"""
import bpy
import hashlib
import itertools
import json
import struct
import sys
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
models=root/'public/models'
source=models/'ONFIT_TShirt_BodyMorph_v2.glb'
human=models/'ONFIT_Human_BodyMorph_v2.glb'
output=models/'ONFIT_TShirt_BodyMorph_v3.glb'
blend=root.parent/'assets/blender/ONFIT_TShirt_BodyMorph_v3.blend'
report_file=output.with_suffix('.json')
assert not any(p.exists() for p in [output,blend,report_file]), 'Refusing to overwrite output'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
hashes={str(p):sha(p) for p in [source,human]}
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete()
def load(path):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return next(o for o in set(bpy.data.objects)-before if o.type=='MESH')
body=load(human);shirt=load(source)
assert body.matrix_world==shirt.matrix_world
def coordinates(obj):
    keys=obj.data.shape_keys.key_blocks
    basis=np.array([v.co[:] for v in keys[0].data])
    points=basis.copy()
    delta={k.name:np.array([v.co[:] for v in k.data])-basis for k in list(keys)[1:]}
    for k in list(keys)[1:]:points+=k.value*delta[k.name]
    return points,delta
skin,skin_delta=coordinates(body)
base,cloth_delta=coordinates(shirt)
body.data.calc_loop_triangles();shirt.data.calc_loop_triangles()
bt=np.array([t.vertices[:] for t in body.data.loop_triangles])
ct=np.array([t.vertices[:] for t in shirt.data.loop_triangles])
tree=BVHTree.FromPolygons([Vector(p) for p in skin],bt.tolist(),all_triangles=True)
names=['shoulder_width','chest_volume','waist_width']
added={name:np.zeros_like(base) for name in names}
for i,p in enumerate(base):
    q,_,face,_=tree.find_nearest(Vector(p));ids=bt[face]
    for name in names:
        delta=skin_delta[name]
        added[name][i]=barycentric_transform(q,*(Vector(skin[j]) for j in ids),*(Vector(delta[j]) for j in ids))
for name,delta in added.items():
    key=shirt.shape_key_add(name='garment_'+name,from_mix=False)
    key.slider_min=-1;key.slider_max=1;key.value=0
    for i,v in enumerate(key.data):v.co=base[i]+delta[i]
    cloth_delta['garment_'+name]=delta
for obj in [body,shirt]:
    for k in obj.data.shape_keys.key_blocks:
        if k.name in names+['pelvis_width'] or k.name.startswith('garment_') and 'abdomen' not in k.name:k.slider_min=-1

def normals(points):return np.cross(points[ct[:,1]]-points[ct[:,0]],points[ct[:,2]]-points[ct[:,0]])
n0=normals(base);valid=np.linalg.norm(n0,axis=1)>1e-12
welded=[tuple(np.round(p,5)) for p in base]
faces=[{welded[i] for i in t} for t in ct]
states=[dict(zip(names,values)) for values in itertools.product([-1,1],repeat=3)]
states+=[{name:sign} for name in names for sign in [-1,1]]
states+=[{}]
checks=[]
for weights in states:
    for abdomen,pelvis in [(0,0),(.8,-1),(.8,1)]:
        weights={**weights,'abdomen_front':abdomen,'pelvis_width':pelvis}
        b=skin.copy();c=base.copy()
        for name,weight in weights.items():
            b+=weight*skin_delta[name];c+=weight*cloth_delta['garment_'+name]
        surface=BVHTree.FromPolygons([Vector(p) for p in b],bt.tolist(),all_triangles=True)
        cloth=BVHTree.FromPolygons([Vector(p) for p in c],ct.tolist(),all_triangles=True)
        gaps=[]
        for p in c:
            q,n,_,_=surface.find_nearest(Vector(p));gaps.append((Vector(p)-q).dot(n))
        flips=int(np.sum(np.sum(normals(c)[valid]*n0[valid],axis=1)<=0))
        assert flips==0,(weights,flips)
        overlaps=len(surface.overlap(cloth))
        self_overlaps=sum(i<j and not faces[i]&faces[j] for i,j in cloth.overlap(cloth))
        checks.append({'weights':weights,'min_gap_m':min(gaps),'inside_over_2mm':sum(g<-.002 for g in gaps),
                       'body_overlap_pairs':overlaps,'self_overlap_pairs':self_overlaps,'flipped_triangles':flips})
shirt.name='ONFIT_TShirt_BodyMorph_v3'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
# Append morph accessors to the original binary. All v2 accessor bytes,
# including indices, positions, UVs, textures and the old two morphs stay exact.
raw=source.read_bytes();n=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+n]);size=struct.unpack_from('<I',raw,20+n)[0]
binary=bytearray(raw[28+n:28+n+size])
to_gltf=lambda p:np.column_stack([p[:,0],p[:,2],-p[:,1]])
primitive=doc['meshes'][0]['primitives'][0]
a=doc['accessors'][primitive['attributes']['POSITION']];v=doc['bufferViews'][a['bufferView']]
start=v.get('byteOffset',0)+a.get('byteOffset',0)
original_points=np.array([struct.unpack_from('<3f',binary,start+i*v.get('byteStride',12)) for i in range(a['count'])])
assert np.allclose(original_points,to_gltf(base),atol=1e-7),'Vertex order mismatch'
def accessor(values):
    values=values.astype('<f4')
    while len(binary)%4:binary.append(0)
    offset=len(binary);binary.extend(values.tobytes())
    doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':values.nbytes})
    doc['accessors'].append({'bufferView':len(doc['bufferViews'])-1,'componentType':5126,'count':len(values),
        'type':'VEC3','min':values.min(axis=0).tolist(),'max':values.max(axis=0).tolist()})
    return len(doc['accessors'])-1
def vertex_normals(points):
    n=np.zeros_like(points);f=normals(points)
    for axis in range(3):np.add.at(n,ct[:,axis],f)
    return n/np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-12)
base_normals=vertex_normals(base)
for name,delta in added.items():
    primitive['targets'].append({'POSITION':accessor(to_gltf(delta)),
        'NORMAL':accessor(to_gltf(vertex_normals(base+delta)-base_normals))})
    doc['meshes'][0]['extras']['targetNames'].append('garment_'+name)
    doc['meshes'][0]['weights'].append(0)
doc['buffers'][0]['byteLength']=len(binary)
j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*(-len(j)%4);binary+=b'\0'*(-len(binary)%4)
output.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+
                   struct.pack('<II',len(binary),0x004e4942)+binary)
assert all(sha(Path(p))==h for p,h in hashes.items())
report={'source_hashes':hashes,'output_sha256':sha(output),'vertices':len(base),'checks':checks,
    'targets':doc['meshes'][0]['extras']['targetNames'],'new_default_weights':[0,0,0],
    'signed_range':[-1,1],'visual_verification':False,
    'method':'Barycentric transfer of three body morphs; v2 geometry and original two morphs retained byte-for-byte'}
report_file.write_text(json.dumps(report,indent=2),encoding='utf8')
print('ONFIT_GARMENT_V3',json.dumps({'targets':report['targets'],'checks':len(checks),
    'worst_gap':min(c['min_gap_m'] for c in checks),'worst_overlap':max(c['body_overlap_pairs'] for c in checks),
    'worst_self_overlap':max(c['self_overlap_pairs'] for c in checks)}))
