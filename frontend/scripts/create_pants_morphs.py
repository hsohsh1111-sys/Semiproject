"""Blender --factory-startup --background --python this.py -- FRONTEND.
Author signed pants keys from existing body deltas; retain source GLB buffers.
No downloads, MPFB initialization, source writes, or cloth simulation.
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
assets=root.parent/'assets/blender'
names=['waist_width','pelvis_width','hip_volume','thigh_girth']
source=models/'ONFIT_Pants_v1.glb'
human=models/'ONFIT_Human_BodyMorph_v3.glb'
top_source=models/'ONFIT_TShirt_BodyMorph_v3.glb'
output=models/'ONFIT_Pants_BodyMorph_v1.glb'
top_output=models/'ONFIT_TShirt_BodyMorph_v4.glb'
blend=assets/'ONFIT_Pants_BodyMorph_v1.blend'
report_path=output.with_suffix('.json')
assert not any(p.exists() for p in [output,top_output,blend,report_path]),'Refusing overwrite'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
hashes={str(p):sha(p) for p in [source,human,top_source]}
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete()
def load(path):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path))
    return next(o for o in set(bpy.data.objects)-before if o.type=='MESH')
body=load(human);top=load(top_source);pants=load(source)
assert body.matrix_world==top.matrix_world==pants.matrix_world
def coordinates(obj):
    keys=obj.data.shape_keys.key_blocks if obj.data.shape_keys else []
    basis=np.array([v.co[:] for v in (keys[0].data if keys else obj.data.vertices)])
    delta={k.name:np.array([v.co[:] for v in k.data])-basis for k in list(keys)[1:]}
    current=basis.copy()
    for k in list(keys)[1:]:current+=k.value*delta[k.name]
    obj.data.calc_loop_triangles()
    return current,delta,np.array([t.vertices[:] for t in obj.data.loop_triangles])
skin,bd,bt=coordinates(body);shirt,sd,st=coordinates(top);original,_,pt=coordinates(pants)
base=original.copy()
def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def tree(p,t):return BVHTree.FromPolygons([Vector(v) for v in p],t.tolist(),all_triangles=True)
skin_tree=tree(skin,bt)
# Reserve a millimetre of extra upper-pants ease for simultaneous signed hip /
# pelvis / waistband extremes. Point clearance alone misses triangle crossings.
for i,p in enumerate(base.copy()):
    _,n,_,_=skin_tree.find_nearest(Vector(p))
    base[i]+=np.array(n)*.001*smooth(.74,.82,p[2])
deltas={n:np.zeros_like(base) for n in names}
for i,p in enumerate(base):
    q,_,face,_=skin_tree.find_nearest(Vector(p));ids=bt[face]
    for n in names:
        deltas[n][i]=barycentric_transform(q,*(Vector(skin[j]) for j in ids),*(Vector(bd[n][j]) for j in ids))
# The body waist key lives above the jeans' waistband. An authored small lateral
# extension gives the waistband a distinct control, rather than mapping a zero
# body displacement at this lower height or reimplementing a measurement engine.
x,y,z=base.T
deltas['waist_width'][:,0]=.0025*np.clip(x/.15,-1,1)*smooth(.84,.94,z)
deltas['waist_width'][:,1:]=0
# Round the transition at the inner-leg seam using the same transferred field;
# preserve signed symmetry and never change topology, UVs or vertex ordering.
assert all(np.max(np.abs(d))>1e-5 for d in deltas.values())

# An untucked top covers the waistband. Offset only the posterior lower hem,
# not its length or the jeans' height. Keep the existing five top morph deltas.
tx,ty,tz=shirt.T
shirt_original=shirt.copy()
hem=.0035*smooth(.015,.075,ty)*(1-smooth(.19,.25,np.abs(tx)))*(1-smooth(.855,.925,tz))
shirt[:,1]+=hem
radial=np.column_stack([tx,ty+.02])
radial/=np.maximum(np.linalg.norm(radial,axis=1)[:,None],1e-9)
shirt[:,:2]+=radial*(.002*(1-smooth(.88,.98,tz)))[:,None]
top_added={'hip_volume':np.zeros_like(shirt)}
for i,p in enumerate(shirt):
    q,_,face,_=skin_tree.find_nearest(Vector(p));ids=bt[face]
    top_added['hip_volume'][i]=barycentric_transform(q,*(Vector(skin[j]) for j in ids),*(Vector(bd['hip_volume'][j]) for j in ids))
sd['garment_hip_volume']=top_added['hip_volume']
for obj,points,delta in [(pants,base,deltas),(top,shirt,sd)]:
    keys=obj.data.shape_keys.key_blocks if obj.data.shape_keys else None
    old_basis=np.array([v.co[:] for v in keys[0].data]) if keys else None
    if keys:
        shift=points-old_basis
        for k in keys:
            for i,v in enumerate(k.data):v.co+=Vector(shift[i])
        for n,d in top_added.items():
            k=obj.shape_key_add(name='garment_'+n,from_mix=False)
            k.slider_min=-1;k.slider_max=1;k.value=0
            for i,v in enumerate(k.data):v.co=points[i]+d[i]
    else:
        for i,v in enumerate(obj.data.vertices):v.co=points[i]
        obj.shape_key_add(name='Basis',from_mix=False)
        for n,d in delta.items():
            k=obj.shape_key_add(name='garment_'+n,from_mix=False)
            k.slider_min=-1;k.slider_max=1;k.value=0
            for i,v in enumerate(k.data):v.co=points[i]+d[i]

def normals(p,t):return np.cross(p[t[:,1]]-p[t[:,0]],p[t[:,2]]-p[t[:,0]])
def vertex_normals(p,t):
    n=np.zeros_like(p);f=normals(p,t)
    for axis in range(3):np.add.at(n,t[:,axis],f)
    return n/np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-12)
def write_glb(src,dest,points,tri,added):
    raw=src.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n])
    size=struct.unpack_from('<I',raw,20+n)[0];binary=bytearray(raw[28+n:28+n+size])
    primitive=doc['meshes'][0]['primitives'][0]
    a=doc['accessors'][primitive['attributes']['POSITION']];v=doc['bufferViews'][a['bufferView']]
    offset=v.get('byteOffset',0)+a.get('byteOffset',0)
    previous=np.array([struct.unpack_from('<3f',binary,offset+i*v.get('byteStride',12)) for i in range(a['count'])])
    to_gltf=lambda p:np.column_stack([p[:,0],p[:,2],-p[:,1]])
    assert np.allclose(previous,to_gltf(original if src==source else shirt_original),atol=1e-7)
    def accessor(values):
        values=to_gltf(values).astype('<f4')
        while len(binary)%4:binary.append(0)
        offset=len(binary);binary.extend(values.tobytes())
        doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':values.nbytes})
        doc['accessors'].append({'bufferView':len(doc['bufferViews'])-1,'componentType':5126,'count':len(values),'type':'VEC3',
                               'min':values.min(axis=0).tolist(),'max':values.max(axis=0).tolist()})
        return len(doc['accessors'])-1
    primitive['attributes']['POSITION']=accessor(points)
    primitive['attributes']['NORMAL']=accessor(vertex_normals(points,tri))
    for name,d in added.items():
        primitive.setdefault('targets',[]).append({'POSITION':accessor(d),'NORMAL':accessor(vertex_normals(points+d,tri)-vertex_normals(points,tri))})
        doc['meshes'][0].setdefault('extras',{}).setdefault('targetNames',[]).append('garment_'+name)
        doc['meshes'][0].setdefault('weights',[]).append(0)
    doc['buffers'][0]['byteLength']=len(binary)
    j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*(-len(j)%4);binary+=b'\0'*(-len(binary)%4)
    dest.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary)
write_glb(source,output,base,pt,deltas)
write_glb(top_source,top_output,shirt,st,top_added)
for obj in [body,top]:
    for k in obj.data.shape_keys.key_blocks:
        if k.name in names or k.name.startswith('garment_'):k.slider_min=-1 if 'abdomen' not in k.name else 0
bpy.ops.wm.save_as_mainfile(filepath=str(blend))

states=[('base',{})]+[(n+('_minus' if sign<0 else '_plus'),{n:sign}) for n in names for sign in [-1,1]]
states += [('pelvis_min_hip_max',{'pelvis_width':-1,'hip_volume':1}),('waist_max_thigh_min',{'waist_width':1,'thigh_girth':-1}),
           ('abdomen_max_pelvis_min',{'abdomen_front':.8,'pelvis_width':-1})]
states += [('corner_'+str(i),dict(zip(names,values))) for i,values in enumerate(itertools.product([-1,1],repeat=4))]
states += [('restored',{})]
welded=[tuple(np.round(p,5)) for p in base];faces=[{welded[i] for i in t} for t in pt]
baseline_normals=normals(base,pt);valid=np.linalg.norm(baseline_normals,axis=1)>1e-12
checks=[]
for label,w in states:
    b=skin.copy();c=base.copy();s=shirt.copy()
    for n,weight in w.items():
        b+=weight*bd[n]
        if n in deltas:c+=weight*deltas[n]
        if 'garment_'+n in sd:s+=weight*sd['garment_'+n]
    skin_bvh=tree(b,bt);cloth=tree(c,pt);shirt_bvh=tree(s,st)
    gaps=[]
    for p in c:
        q,n,_,_=skin_bvh.find_nearest(Vector(p));gaps.append((Vector(p)-q).dot(n))
    flipped=int(np.sum(np.sum(normals(c,pt)[valid]*baseline_normals[valid],axis=1)<=0))
    self_cross=sum(i<j and not faces[i]&faces[j] for i,j in cloth.overlap(cloth))
    checks.append({'state':label,'weights':w,'min_gap_m':min(gaps),'inside_over_2mm':sum(g<-.002 for g in gaps),
                   'body_overlap_pairs':len(skin_bvh.overlap(cloth)),'top_overlap_pairs':len(shirt_bvh.overlap(cloth)),
                   'self_overlap_pairs':self_cross,'flipped_triangles':flipped})
    assert flipped==0 and self_cross==0,(label,flipped,self_cross)
for n,d in deltas.items():
    key=pants.data.shape_keys.key_blocks['garment_'+n]
    for sign in [-1,1]:
        key.value=sign;bpy.context.view_layer.update()
        e=pants.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh()
        assert np.allclose(np.array([v.co[:] for v in m.vertices]),base+sign*d,atol=2e-7)
        e.to_mesh_clear()
    key.value=0
assert all(sha(Path(p))==h for p,h in hashes.items())
report={'source_hashes':hashes,'output_sha256':sha(output),'top_output_sha256':sha(top_output),'targets':['garment_'+n for n in names],
        'default_weights':[0]*4,'signed_range':[-1,1],'max_delta_m':{n:float(np.linalg.norm(d,axis=1).max()) for n,d in deltas.items()},
        'posterior_hem_offset_max_m':float(hem.max()),'top_layering_target':'garment_hip_volume','checks':checks,'blender_signed_vertex_checks':True,
        'method':'Barycentric body delta transfer; 1mm upper-pants ease; 2.5mm waistband extension; 3.5mm posterior plus 2mm radial top hem layering; transferred hip corrective.',
        'limitations':'Linear artistic morphs, not cloth simulation; finite sampled states do not prove all surfaces collision-free.',
        'browser_verified':False}
report_path.write_text(json.dumps(report,indent=2),encoding='utf8')
print('ONFIT_PANTS_MORPHS',json.dumps(report))
