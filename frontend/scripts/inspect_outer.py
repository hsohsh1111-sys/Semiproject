"""Inspect and render the actual exported static jacket with existing outfit."""
import bpy
import hashlib
import json
import sys
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
long_sleeve='--long-sleeve' in sys.argv
hood='--hood' in sys.argv
long_sleeve=long_sleeve or hood
label=sys.argv[sys.argv.index('--')+2] if len(sys.argv)>sys.argv.index('--')+2 else 'outer_v1'
assets=root.parent/'assets/blender';out=assets/f'previews/{label}'
report_path=assets/('ONFIT_Outer_v1.validation.json' if label=='outer_v1' else label+'.validation.json')
assert not report_path.exists(),'Refusing overwrite'
out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete()
inputs={}
def load(name):
    path=root/'public/models'/name;inputs[name]=hashlib.sha256(path.read_bytes()).hexdigest()
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path))
    return next(o for o in set(bpy.data.objects)-before if o.type=='MESH')
body=load('ONFIT_Human_BodyMorph_v3.glb');top=load('ONFIT_HoodedJacket_v1.glb' if hood else 'ONFIT_LongSleeve_v1.glb' if long_sleeve else 'ONFIT_TShirt_BodyMorph_v5.glb')
pants=load('ONFIT_Pants_BodyMorph_v2.glb');outer=load('ONFIT_Outer_BodyMorph_v1.glb' if long_sleeve else 'ONFIT_Outer_v1.glb')
target=top if long_sleeve else outer
assert target.data.shape_keys is None,'Static garment must not invent morphs'
assert body.matrix_world==top.matrix_world==pants.matrix_world==outer.matrix_world
def geometry(obj):
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=e.to_mesh();mesh.calc_loop_triangles()
    p=np.array([(obj.matrix_world@v.co)[:] for v in mesh.vertices]);t=np.array([f.vertices[:] for f in mesh.loop_triangles])
    e.to_mesh_clear();return p,t,BVHTree.FromPolygons([Vector(v) for v in p],t.tolist(),all_triangles=True)
surfaces={name:geometry(obj) for name,obj in [('body',body),('top',top),('bottom',pants),('outer',outer)]}
p,t,bvh=surfaces['top' if long_sleeve else 'outer'];welded=[tuple(np.round(v,5)) for v in p];faces=[{welded[i] for i in f} for f in t]
normal=np.cross(p[t[:,1]]-p[t[:,0]],p[t[:,2]]-p[t[:,0]])
assert np.isfinite(p).all() and np.isfinite(normal).all()
checks={}
for name in (['body','bottom','outer'] if long_sleeve else ['body','top','bottom']):
    gaps=[]
    for point in p:
        q,n,_,distance=surfaces[name][2].find_nearest(Vector(point))
        # Nearest signed gap is only meaningful near the open garment surface.
        if distance<.05:gaps.append((Vector(point)-q).dot(n))
    pairs=surfaces[name][2].overlap(bvh)
    checks[name]={'overlap_pairs':len(pairs),'min_near_signed_gap_m':min(gaps,default=None),
                  'near_samples':len(gaps),'inside_over_2mm':sum(g<-.002 for g in gaps),
                  'near_coplanar_samples_under_half_mm':sum(abs(g)<.0005 for g in gaps),
                  'overlap_locations':[(p[t[j]].mean(axis=0)).tolist() for _,j in pairs[:12]]}
self_pairs=[(i,j) for i,j in bvh.overlap(bvh) if i<j and not faces[i]&faces[j]]
report={'input_hashes':inputs,'vertices':len(p),'triangles':len(t),'morph_targets':0,
        'bounds_blender':{'min':p.min(axis=0).tolist(),'max':p.max(axis=0).tolist()},
        'checks':checks,'self_nonadjacent_overlap_pairs':len(self_pairs),
        'self_overlap_locations':[(p[t[i]].mean(axis=0)).tolist() for i,j in self_pairs[:12]],
        'degenerate_triangles':int(np.sum(np.linalg.norm(normal,axis=1)<1e-12)),
        'uv_layers':len(target.data.uv_layers),'materials':[m.name for m in target.data.materials],
        'note':'Static baseline only. Triangle checks and nearest gaps do not replace visual review or prove absence of z-fighting.',
        'browser_verified':False}
report_path.write_text(json.dumps(report,indent=2),encoding='utf8')
if '--no-render' in sys.argv:
    print('ONFIT_OUTER_VALIDATION',json.dumps(report));sys.exit(0)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.render.resolution_x=400;scene.render.resolution_y=600;scene.render.resolution_percentage=100
scene.world.color=(.3,.3,.3)
def aim(o):o.rotation_euler=(Vector((0,0,.85))-o.location).to_track_quat('-Z','Y').to_euler()
for loc in [(2,-3,3),(-2,3,3),(-3,-1,2)]:
    d=bpy.data.lights.new('Softbox','AREA');d.energy=250;d.size=3
    o=bpy.data.objects.new('Softbox',d);scene.collection.objects.link(o);o.location=loc;aim(o)
d=bpy.data.cameras.new('OutfitCamera');d.type='ORTHO';d.ortho_scale=1.9
cam=bpy.data.objects.new('OutfitCamera',d);scene.collection.objects.link(cam);scene.camera=cam
combinations=([('long_only',True,False,False),('long_pants',True,True,False),('long_outer',True,False,True),('all_layers',True,True,True)] if long_sleeve else
              [('outer_only',False,False,True),('top_outer',True,False,True),('all_layers',True,True,True)])
for label,show_top,show_pants,show_outer in combinations:
    top.hide_render=not show_top;pants.hide_render=not show_pants;outer.hide_render=not show_outer
    for view,loc in [('front',(0,-3,.85)),('side',(3,0,.85)),('back',(0,3,.85))]:
        path=out/f'{label}_{view}.png';assert not path.exists()
        cam.location=loc;aim(cam);scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
assert all(hashlib.sha256((root/'public/models'/name).read_bytes()).hexdigest()==h for name,h in inputs.items())
print('ONFIT_OUTER_VALIDATION',json.dumps(report))
