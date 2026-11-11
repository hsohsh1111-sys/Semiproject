"""Local static fitting of the real long-sleeve asset; all originals retained.
Blender --factory-startup --background --python this.py -- FRONTEND
"""
import bpy
import hashlib
import json
import struct
import sys
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=Path(sys.argv[sys.argv.index('--')+1]).resolve();assets=root.parent/'assets/blender';models=root/'public/models'
source=assets/'long_sleeve_drafts/ONFIT_LongSleeve_v1.initial.glb'
output=models/'ONFIT_LongSleeve_v1.glb';blend=assets/'ONFIT_LongSleeve_v1.blend'
assert not output.exists() and not blend.exists(),'Refusing overwrite'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete()
def load(path):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path))
    return next(o for o in set(bpy.data.objects)-before if o.type=='MESH')
body=load(models/'ONFIT_Human_BodyMorph_v3.glb');pants=load(models/'ONFIT_Pants_BodyMorph_v2.glb');outer=load(models/'ONFIT_Outer_BodyMorph_v1.glb')
shirt=load(source)
def tree(obj):
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=e.to_mesh();mesh.calc_loop_triangles()
    result=BVHTree.FromPolygons([obj.matrix_world@v.co for v in mesh.vertices],[list(t.vertices) for t in mesh.loop_triangles],all_triangles=True)
    e.to_mesh_clear();return result
skin=tree(body);coat=tree(outer)
base=np.array([v.co[:] for v in shirt.data.vertices]);points=base.copy()
def smooth(a,b,v):
    t=np.clip((v-a)/(b-a),0,1);return t*t*(3-2*t)
for i,p in enumerate(base):
    q,n,_,_=skin.find_nearest(Vector(p));gap=(Vector(p)-q).dot(n)
    chest=smooth(1.10,1.16,p[2])*(1-smooth(1.29,1.35,p[2]))*(1-smooth(.13,.17,abs(p[0])))*(1-smooth(-.10,-.055,p[1]))
    points[i,1]-=.003*chest
    # A uniform small arm clearance adjustment avoids copying the jacket's
    # cuff wrinkles onto its under-layer through discontinuous nearest hits.
    points[i]-=np.array(n)*.0005*smooth(.30,.38,abs(p[0]))
    # End the under-layer cuff a few mm before the jacket's cuff. Keep the
    # authored sleeve, elbow and neckline; no generated geometry or new morphs.
    cuff=smooth(.38,.47,abs(p[0]))*(1-smooth(1.065,1.14,p[2]))
    direction=Vector((-np.sign(p[0]),.75,1))
    tangent=direction-n*direction.dot(n)
    if tangent.length>1e-8:points[i]+=np.array(tangent.normalized())*.012*cuff
    q2,n2,_,_=skin.find_nearest(Vector(points[i]));gap2=(Vector(points[i])-q2).dot(n2)
    if abs(p[0])>.30 and gap2<.0035:points[i]+=np.array(n2)*(.0035-gap2)
shirt.data.calc_loop_triangles();tri=np.array([t.vertices[:] for t in shirt.data.loop_triangles])
_,inverse=np.unique(np.round(base,6),axis=0,return_inverse=True)
count=int(inverse.max())+1;counts=np.bincount(inverse,minlength=count)
edges=inverse[np.concatenate([tri[:,[0,1]],tri[:,[1,2]],tri[:,[2,0]]])]
edges=np.unique(np.sort(edges,axis=1),axis=0);edges=edges[edges[:,0]!=edges[:,1]]
edges=np.concatenate([edges,edges[:,::-1]]);degree=np.bincount(edges[:,0],minlength=count)
displacement=np.zeros((count,3));np.add.at(displacement,inverse,points-base);displacement/=counts[:,None]
average=np.zeros_like(displacement);np.add.at(average,edges[:,0],displacement[edges[:,1]])
correction=.25*(average/np.maximum(degree,1)[:,None]-displacement)
length=np.linalg.norm(correction,axis=1);correction*=np.minimum(1,.0003/np.maximum(length,1e-12))[:,None]
points+=correction[inverse]*smooth(.35,.40,np.abs(base[:,0]))[:,None]
for i,v in enumerate(shirt.data.vertices):v.co=points[i]
n=np.zeros((int(inverse.max())+1,3));f=np.cross(points[tri[:,1]]-points[tri[:,0]],points[tri[:,2]]-points[tri[:,0]])
for axis in range(3):np.add.at(n,inverse[tri[:,axis]],f)
n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-12);n=n[inverse]
shirt.data.normals_split_custom_set_from_vertices(n.tolist())
raw=source.read_bytes();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size])
length=struct.unpack_from('<I',raw,20+size)[0];binary=bytearray(raw[28+size:28+size+length]);primitive=doc['meshes'][0]['primitives'][0]
def accessor(values):
    values=np.column_stack([values[:,0],values[:,2],-values[:,1]]).astype('<f4')
    while len(binary)%4:binary.append(0)
    offset=len(binary);binary.extend(values.tobytes())
    doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':values.nbytes})
    doc['accessors'].append({'bufferView':len(doc['bufferViews'])-1,'componentType':5126,'count':len(values),'type':'VEC3',
                            'min':values.min(axis=0).tolist(),'max':values.max(axis=0).tolist()})
    return len(doc['accessors'])-1
primitive['attributes']['POSITION']=accessor(points);primitive['attributes']['NORMAL']=accessor(n)
doc['buffers'][0]['byteLength']=len(binary)
j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*(-len(j)%4);binary+=b'\0'*(-len(binary)%4)
output.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary)
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
manifest=assets/'ONFIT_LongSleeve_v1.source.json';report=json.loads(manifest.read_text(encoding='utf8'))
report['initial_fitted_glb_sha256']=hashlib.sha256(raw).hexdigest();report['glb_sha256']=hashlib.sha256(output.read_bytes()).hexdigest()
report['local_fitting_max_m']=float(np.linalg.norm(points-base,axis=1).max())
report['layering_method']='3mm front-chest ease excluding armpits; 0.5mm arm ease adjustment; cuff moved up to 12mm along skin tangent with 3.5mm vertex clearance floor.'
report['bounds']={'min':np.column_stack([points[:,0],points[:,2],-points[:,1]]).min(axis=0).tolist(),
                  'max':np.column_stack([points[:,0],points[:,2],-points[:,1]]).max(axis=0).tolist()}
manifest.write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf8')
print('ONFIT_LONG_SLEEVE_FIT',report['local_fitting_max_m'])
