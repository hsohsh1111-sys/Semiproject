"""Reload the exported cap, inspect real head/hood contacts and render outfits."""
import bpy
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root=Path(sys.argv[sys.argv.index('--')+1]).resolve();models=root/'public/models';assets=root.parent/'assets/blender'
neutral='--neutral' in sys.argv
stem='ONFIT_Cap_Neutral_v1' if neutral else 'ONFIT_Cap_v1'
report_path=assets/(stem+'.validation.json')
assert not report_path.exists(),'Refusing overwrite'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete()
paths={'body':'ONFIT_Human_BodyMorph_v3.glb','cap':stem+'.glb','top':'ONFIT_TShirt_BodyMorph_v5.glb',
       'bottom':'ONFIT_Pants_BodyMorph_v2.glb','outer':'ONFIT_Outer_BodyMorph_v1.glb','hood':'ONFIT_HoodedJacket_BodyMorph_v1.glb'}
objects={};hashes={}
for slot,name in paths.items():
    path=models/name;hashes[name]=hashlib.sha256(path.read_bytes()).hexdigest()
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path))
    added=[o for o in set(bpy.data.objects)-before if o.type=='MESH'];assert len(added)==1
    objects[slot]=added[0]
assert len({tuple(tuple(row) for row in o.matrix_world) for o in objects.values()})==1
def geometry(obj):
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();m.calc_loop_triangles()
    p=np.array([(obj.matrix_world@v.co)[:] for v in m.vertices]);t=np.array([f.vertices[:] for f in m.loop_triangles])
    e.to_mesh_clear();return p,t,BVHTree.FromPolygons([Vector(v) for v in p],t.tolist(),all_triangles=True)
surfaces={slot:geometry(obj) for slot,obj in objects.items()}
p,t,bvh=surfaces['cap'];cap=objects['cap'];head=surfaces['body'][0];head=head[head[:,2]>1.45]
assert cap.data.shape_keys is None,'Cap is static'
assert p[:,2].min()>1.4,'Cap must be at the actual head, not recentered'
assert np.isfinite(p).all()
normal=np.cross(p[t[:,1]]-p[t[:,0]],p[t[:,2]]-p[t[:,0]])
checks={}
for slot in ['body','top','bottom','outer','hood']:
    other=surfaces[slot][2];pairs=other.overlap(bvh)
    gaps=[]
    for point in p:
        q,n,_,distance=other.find_nearest(Vector(point))
        if distance<.05:gaps.append((Vector(point)-q).dot(n))
    checks[slot]={'overlap_pairs':len(pairs),'near_samples':len(gaps),'min_near_signed_gap_m':min(gaps,default=None),
        'inside_over_2mm':sum(v<-.002 for v in gaps),'overlap_locations':[p[t[j]].mean(axis=0).tolist() for _,j in pairs[:8]]}
welded=[tuple(np.round(v,6)) for v in p];faces=[{welded[i] for i in f} for f in t]
self_pairs=[(i,j) for i,j in bvh.overlap(bvh) if i<j and not faces[i]&faces[j]]
# The supplied down hood is below the cap, but verify its actual deformed
# positions at signed upper-body corners as well as its neutral state.
hood=objects['hood'];hood_checks=[]
import itertools
for i,values in enumerate(itertools.product([-1,1],repeat=4)):
    names=['shoulder_width','chest_volume','waist_width','pelvis_width']
    for key in hood.data.shape_keys.key_blocks:
        key.slider_min=-1 if 'abdomen' not in key.name else 0
        key.value=dict(zip(names,values)).get(key.name.removeprefix('garment_'),.8 if 'abdomen' in key.name else 0)
    bpy.context.view_layer.update();hp,ht,hbvh=geometry(hood)
    hood_checks.append({'corner':i,'cap_overlap_pairs':len(bvh.overlap(hbvh))})
for key in hood.data.shape_keys.key_blocks:key.value=0
report={'input_hashes':hashes,'vertices':len(p),'triangles':len(t),'morph_targets':0,
    'bounds_blender':{'min':p.min(axis=0).tolist(),'max':p.max(axis=0).tolist()},
    'head_bounds_blender':{'min':head.min(axis=0).tolist(),'max':head.max(axis=0).tolist()},
    'checks':checks,'hood_corner_checks':hood_checks,'supports_down_hood':checks['hood']['overlap_pairs']==0 and all(c['cap_overlap_pairs']==0 for c in hood_checks),
    'self_nonadjacent_overlap_pairs':len(self_pairs),'degenerate_triangles':int(np.sum(np.linalg.norm(normal,axis=1)<1e-12)),
    'uv_layers':len(cap.data.uv_layers),'materials':[m.name for m in cap.data.materials],
    'browser_verified':False,'note':'Triangle overlaps and nearest signed gaps are diagnostics, not visual quality proof; only the existing down hood is tested.'}
report_path.write_text(json.dumps(report,indent=2),encoding='utf8')
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=10;scene.cycles.use_denoising=True
scene.render.resolution_x=400;scene.render.resolution_y=600;scene.render.resolution_percentage=100;scene.world.color=(.3,.3,.3)
def aim(obj,target=(0,0,.86)):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
for loc in [(2,-3,3),(-2,3,3),(-3,-1,2)]:
    d=bpy.data.lights.new('Softbox','AREA');d.energy=250;d.size=3
    obj=bpy.data.objects.new('Softbox',d);scene.collection.objects.link(obj);obj.location=loc;aim(obj)
d=bpy.data.cameras.new('CapCamera');d.type='ORTHO';d.ortho_scale=1.95
cam=bpy.data.objects.new('CapCamera',d);scene.collection.objects.link(cam);scene.camera=cam
out=assets/('previews/cap_neutral_v1' if neutral else 'previews/cap_v1');out.mkdir(parents=True,exist_ok=True)
for label,slots in [('cap_only',[]),('cap_outfit',['top','bottom','outer']),('cap_hood',['hood','bottom'])]:
    for slot in ['top','bottom','outer','hood']:objects[slot].hide_render=slot not in slots
    for view,loc in [('front',(0,-3,.86)),('side',(3,0,.86)),('back',(0,3,.86))]:
        path=out/f'{label}_{view}.png';assert not path.exists()
        cam.location=loc;aim(cam);scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
for slot in ['top','bottom','outer','hood']:objects[slot].hide_render=True
d.ortho_scale=.45
for view,loc in [('front',(0,-3,1.65)),('side',(3,0,1.65)),('back',(0,3,1.65))]:
    path=out/f'head_{view}.png';assert not path.exists()
    cam.location=loc;aim(cam,(0,0,1.65));scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
if neutral:
    # The actual neutral map is constant opaque white. These temporary PBR
    # factor overrides match the four runtime cloned-material colors; they do
    # not modify the exported GLB or shared body/outfit materials.
    for name,hexcolor in [('black','16181D'),('navy','1B2944'),('beige','C8B89D'),('charcoal','373B43')]:
        values=[int(hexcolor[i:i+2],16)/255 for i in [0,2,4]]
        rgba=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values]+[1]
        for material in cap.data.materials:
            for node in material.node_tree.nodes:
                if node.type=='BSDF_PRINCIPLED':
                    socket=node.inputs['Base Color']
                    for link in list(socket.links):material.node_tree.links.remove(link)
                    socket.default_value=rgba
        for view,loc in [('front',(0,-3,1.65)),('side',(3,0,1.65)),('back',(0,3,1.65))]:
            path=out/f'{name}_{view}.png';assert not path.exists()
            cam.location=loc;aim(cam,(0,0,1.65));scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
assert all(hashlib.sha256((models/name).read_bytes()).hexdigest()==value for name,value in hashes.items())
print('ONFIT_CAP_VALIDATION',json.dumps(report))
