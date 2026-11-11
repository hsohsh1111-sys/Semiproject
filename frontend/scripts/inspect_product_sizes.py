"""Independent triangle checks/renders of exported Three.js size sample states."""
import bpy
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=Path(sys.argv[sys.argv.index('--')+1]).resolve();models=root/'public/models'
calibrated='--calibrated' in sys.argv
quality='--quality' in sys.argv or calibrated
label=sys.argv[sys.argv.index('--label')+1] if '--label' in sys.argv else 'product_sizes_v3' if calibrated else 'product_sizes_v2' if quality else 'product_sizes_v1'
out=root.parent/'assets/blender/previews'/label
report_path=out/'validation.json';assert not report_path.exists(),'Refusing overwrite'
metadata=json.loads((out/'states.json').read_text());data=np.frombuffer((out/'states.bin').read_bytes(),dtype='<f4')
for name,digest in metadata['sourceHashes'].items():assert hashlib.sha256((models/name).read_bytes()).hexdigest()==digest
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete()
def load(name):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(models/name))
    return next(obj for obj in set(bpy.data.objects)-before if obj.type=='MESH')
objects={'body':load('ONFIT_Human_BodyMorph_v3.glb'),'tee':load('ONFIT_TShirt_BodyMorph_v5.glb')}
tri={}
for slot,obj in objects.items():
    obj.data.calc_loop_triangles();tri[slot]=np.array([t.vertices[:] for t in obj.data.loop_triangles])
def points(state,slot):
    item=state[slot];p=data[item['offset']//4:item['offset']//4+item['count']*3].reshape(-1,3)
    return np.column_stack([p[:,0],-p[:,2],p[:,1]])
def tree(p,t):return BVHTree.FromPolygons([Vector(v) for v in p],t.tolist(),all_triangles=True)
states=metadata['states'];base=next(s for s in states if s['name']=='M_base');p0=points(base,'tee')
if not calibrated:assert np.allclose(p0,np.array([v.co[:] for v in objects['tee'].data.vertices]),atol=2e-7),'Reference M must restore exact source positions'
faces=[{tuple(np.round(p0[i],6)) for i in face} for face in tri['tee']]
def normals(p):
    t=tri['tee'];return np.cross(p[t[:,1]]-p[t[:,0]],p[t[:,2]]-p[t[:,0]])
checks=[]
for state in states:
    p=points(state,'tee');skin=points(state,'body');surface=tree(p,tri['tee']);body=tree(skin,tri['body'])
    pairs=body.overlap(surface);self_pairs=[(i,j) for i,j in surface.overlap(surface) if i<j and not faces[i]&faces[j]]
    reference=state if quality else next(s for s in states if s['size']=='M' and s['extreme']==state['extreme'])
    n0=normals(points(reference,'referenceTee' if quality else 'tee'));valid=np.linalg.norm(n0,axis=1)>1e-12
    gaps=[]
    for point in p:
        q,n,_,distance=body.find_nearest(Vector(point))
        if distance<.05:gaps.append((Vector(point)-q).dot(n))
    checks.append({'name':state['name'],'sample':True,'body_overlap_pairs':len(pairs),'self_overlap_pairs':len(self_pairs),
        'size_induced_normal_reversals':int(np.sum(np.sum(normals(p)[valid]*n0[valid],axis=1)<=0)),
        'min_near_signed_gap_m':min(gaps,default=None),'near_samples_inside_2mm':sum(g<-.002 for g in gaps),
        'overlap_locations':[p[tri['tee'][j]].mean(axis=0).tolist() for _,j in pairs[:6]],'measurements':state.get('measurements')})
report={'checks':checks,'sourceHashes':metadata['sourceHashes'],'sample_only':True,'absolute_dimensions_calibrated':False,'proxy_targets_calibrated':calibrated,
    'browser_verified':False,'method':'Actual Three.js evaluated vertices; BVH triangle overlaps and nearest signed gaps. Not cloth simulation or proof of fit.'}
report_path.write_text(json.dumps(report,indent=2),encoding='utf8')
for obj in objects.values():
    if obj.data.shape_keys:obj.shape_key_clear()
material=bpy.data.materials.new('QA plain product cloth');material.use_nodes=True
node=material.node_tree.nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=(.008,.009,.012,1);node.inputs['Roughness'].default_value=.9
objects['tee'].data.materials.clear();objects['tee'].data.materials.append(material)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=10;scene.cycles.use_denoising=True
scene.render.resolution_x=360;scene.render.resolution_y=540;scene.render.resolution_percentage=100;scene.world.color=(.3,.3,.3)
def aim(obj):obj.rotation_euler=(Vector((0,0,.85))-obj.location).to_track_quat('-Z','Y').to_euler()
for loc in [(2,-3,3),(-2,3,3),(-3,-1,2)]:
    light=bpy.data.lights.new('Softbox','AREA');light.energy=250;light.size=3
    obj=bpy.data.objects.new('Softbox',light);scene.collection.objects.link(obj);obj.location=loc;aim(obj)
camera=bpy.data.cameras.new('SizeCamera');camera.type='ORTHO';camera.ortho_scale=1.9
cam=bpy.data.objects.new('SizeCamera',camera);scene.collection.objects.link(cam);scene.camera=cam
for state in states:
    if not quality and state['extreme'] and state['size'] not in ['M','XL']:continue
    for slot,obj in objects.items():
        p=points(state,slot)
        for i,vertex in enumerate(obj.data.vertices):vertex.co=p[i]
        obj.data.update()
    for view,loc in [('front',(0,-3,.85)),('side',(3,0,.85)),('back',(0,3,.85))]:
        path=out/f'{state["name"]}_{view}.png';assert not path.exists()
        cam.location=loc;aim(cam);scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
assert all(hashlib.sha256((models/name).read_bytes()).hexdigest()==digest for name,digest in metadata['sourceHashes'].items())
print('ONFIT_PRODUCT_SIZE_CHECKS',json.dumps(checks))
