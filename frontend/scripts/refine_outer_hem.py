"""Small front-hem adjustment to the fitted real jacket, retaining GLB buffers.
Blender --factory-startup --background --python this.py -- FRONTEND
Preserve the initial fitted GLB/BLEND in assets/blender/outer_drafts first.
"""
import bpy
import hashlib
import json
import struct
import sys
from pathlib import Path
import numpy as np
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
assets=root.parent/'assets/blender';models=root/'public/models'
source=assets/'outer_drafts/ONFIT_Outer_v1.initial.glb'
output=models/'ONFIT_Outer_v1.glb';blend=assets/'ONFIT_Outer_v1.blend'
assert not output.exists() and not blend.exists(),'Refusing overwrite'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete()
for path in [models/'ONFIT_Human_BodyMorph_v3.glb',models/'ONFIT_TShirt_BodyMorph_v5.glb',models/'ONFIT_Pants_BodyMorph_v2.glb']:
    bpy.ops.import_scene.gltf(filepath=str(path))
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(source))
outer=next(o for o in set(bpy.data.objects)-before if o.type=='MESH')
base=np.array([v.co[:] for v in outer.data.vertices]);p=base.copy();x,y,z=base.T
def smooth(a,b,v):
    t=np.clip((v-a)/(b-a),0,1);return t*t*(3-2*t)
weight=(1-smooth(.89,.97,z))*(1-smooth(.09,.16,np.abs(x)))*(1-smooth(-.13,-.07,y))
p[:,1]-=.008*weight
rear=(1-smooth(.88,.96,z))*smooth(.015,.065,y)*smooth(.075,.13,np.abs(x))*(1-smooth(.20,.26,np.abs(x)))
p[:,1]+=.0035*rear
for i,v in enumerate(outer.data.vertices):v.co=p[i]
outer.data.calc_loop_triangles();tri=np.array([t.vertices[:] for t in outer.data.loop_triangles])
_,inverse=np.unique(np.round(base,6),axis=0,return_inverse=True)
n=np.zeros((int(inverse.max())+1,3));f=np.cross(p[tri[:,1]]-p[tri[:,0]],p[tri[:,2]]-p[tri[:,0]])
for axis in range(3):np.add.at(n,inverse[tri[:,axis]],f)
n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-12);n=n[inverse]
outer.data.normals_split_custom_set_from_vertices(n.tolist())
raw=source.read_bytes();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size])
length=struct.unpack_from('<I',raw,20+size)[0];binary=bytearray(raw[28+size:28+size+length])
primitive=doc['meshes'][0]['primitives'][0]
def accessor(values):
    values=np.column_stack([values[:,0],values[:,2],-values[:,1]]).astype('<f4')
    while len(binary)%4:binary.append(0)
    offset=len(binary);binary.extend(values.tobytes())
    doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':values.nbytes})
    doc['accessors'].append({'bufferView':len(doc['bufferViews'])-1,'componentType':5126,'count':len(values),'type':'VEC3',
                            'min':values.min(axis=0).tolist(),'max':values.max(axis=0).tolist()})
    return len(doc['accessors'])-1
primitive['attributes']['POSITION']=accessor(p);primitive['attributes']['NORMAL']=accessor(n)
doc['buffers'][0]['byteLength']=len(binary)
j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*(-len(j)%4);binary+=b'\0'*(-len(binary)%4)
output.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary)
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
manifest=assets/'ONFIT_Outer_v1.source.json';report=json.loads(manifest.read_text(encoding='utf8'))
report['initial_fitted_glb_sha256']=hashlib.sha256(raw).hexdigest()
report['glb_sha256']=hashlib.sha256(output.read_bytes()).hexdigest()
report['front_hem_correction_max_m']=float(np.linalg.norm(p-base,axis=1).max())
report['front_hem_method']='8mm feathered anterior lower opening and 3.5mm rear-side hem ease; source UV, texture, index bytes preserved.'
report['bounds']={'min':np.column_stack([p[:,0],p[:,2],-p[:,1]]).min(axis=0).tolist(),
                  'max':np.column_stack([p[:,0],p[:,2],-p[:,1]]).max(axis=0).tolist()}
manifest.write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf8')
print('ONFIT_OUTER_HEM',report['front_hem_correction_max_m'])
