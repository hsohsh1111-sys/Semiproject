"""Read-only validation and CPU rendering of exported body/top/bottom GLBs."""
import bpy
import hashlib
import json
import sys
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
label=sys.argv[sys.argv.index('--')+2] if len(sys.argv)>sys.argv.index('--')+2 else 'pants_v1'
out=root.parent/f'assets/blender/previews/{label}'
out.mkdir(parents=True,exist_ok=True)
report_path=root.parent/f'assets/blender/{label}.validation.json'
assert not report_path.exists(),'Refusing to overwrite validation'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete()
inputs={}
def load(name):
    path=root/'public/models'/name
    inputs[name]=hashlib.sha256(path.read_bytes()).hexdigest()
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path))
    return next(o for o in set(bpy.data.objects)-before if o.type=='MESH')
body=load('ONFIT_Human_BodyMorph_v3.glb')
shirt=load('ONFIT_TShirt_BodyMorph_v3.glb')
pants=load('ONFIT_Pants_v1.glb')
assert pants.data.shape_keys is None
def geometry(obj):
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();m.calc_loop_triangles()
    p=np.array([(obj.matrix_world@v.co)[:] for v in m.vertices]);t=np.array([f.vertices[:] for f in m.loop_triangles])
    e.to_mesh_clear();return p,t,BVHTree.FromPolygons([Vector(v) for v in p],t.tolist(),all_triangles=True)
b,bt,skin=geometry(body);s,st,top=geometry(shirt);p,pt,bottom=geometry(pants)
gaps=[]
for point in p:
    q,n,_,_=skin.find_nearest(Vector(point));gaps.append((Vector(point)-q).dot(n))
welded=[tuple(np.round(v,5)) for v in p];faces=[{welded[i] for i in t} for t in pt]
self_pairs=[(i,j) for i,j in bottom.overlap(bottom) if i<j and not faces[i]&faces[j]]
body_pairs=skin.overlap(bottom);shirt_pairs=top.overlap(bottom)
normals=np.cross(p[pt[:,1]]-p[pt[:,0]],p[pt[:,2]]-p[pt[:,0]])
assert np.isfinite(p).all() and np.isfinite(normals).all()
report={'input_hashes':inputs,'default_body_weights':{k.name:k.value for k in body.data.shape_keys.key_blocks},
    'pants_morphs':0,'pants_vertices':len(p),'pants_triangles':len(pt),
    'min_signed_skin_gap_m':min(gaps),'inside_over_2mm':sum(g<-.002 for g in gaps),
    'self_nonadjacent_overlap_pairs':len(self_pairs),'body_overlap_pairs':len(body_pairs),
    'shirt_overlap_pairs':len(shirt_pairs),'degenerate_triangles':int(np.sum(np.linalg.norm(normals,axis=1)<1e-12)),
    'body_overlap_locations':[(p[pt[j]].mean(axis=0)).tolist() for _,j in body_pairs[:12]],
    'shirt_overlap_locations':[(p[pt[j]].mean(axis=0)).tolist() for _,j in shirt_pairs[:12]],
    'note':'Signed nearest-surface samples and triangle overlap checks; visual review required. Static basic fit only.'}
report_path.write_text(json.dumps(report,indent=2),encoding='utf8')
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.render.resolution_x=400;scene.render.resolution_y=600;scene.render.resolution_percentage=100
scene.world.color=(.3,.3,.3)
def aim(o):o.rotation_euler=(Vector((0,0,.84))-o.location).to_track_quat('-Z','Y').to_euler()
for loc in [(2,-3,3),(-2,3,3),(-3,-1,2)]:
    data=bpy.data.lights.new('Softbox','AREA');data.energy=250;data.size=3
    obj=bpy.data.objects.new('Softbox',data);scene.collection.objects.link(obj);obj.location=loc;aim(obj)
data=bpy.data.cameras.new('OutfitCamera');data.type='ORTHO';data.ortho_scale=1.9
cam=bpy.data.objects.new('OutfitCamera',data);scene.collection.objects.link(cam);scene.camera=cam
for label,visible in [('pants_only',False),('top_bottom',True)]:
    shirt.hide_render=not visible
    for view,loc in [('front',(0,-3,.84)),('side',(3,0,.84)),('back',(0,3,.84))]:
        cam.location=loc;aim(cam);path=out/f'{label}_{view}.png';assert not path.exists()
        scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
assert all(hashlib.sha256((root/'public/models'/name).read_bytes()).hexdigest()==h for name,h in inputs.items())
print('ONFIT_PANTS_VALIDATION',json.dumps(report))
