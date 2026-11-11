"""Render and evaluate actual exported pants/top/body GLBs, never their sources."""
import bpy
import json
import sys
from pathlib import Path
import numpy as np
from mathutils import Vector
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
out=root.parent/'assets/blender/previews/pants_bodymorph_v1'
out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete()
def load(name):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(root/'public/models'/name))
    return next(o for o in set(bpy.data.objects)-before if o.type=='MESH')
body=load('ONFIT_Human_BodyMorph_v3.glb');top=load('ONFIT_TShirt_BodyMorph_v4.glb');pants=load('ONFIT_Pants_BodyMorph_v1.glb')
defaults={o:{k.name:k.value for k in o.data.shape_keys.key_blocks} for o in [body,top,pants]}
for o in [body,top,pants]:
    for k in o.data.shape_keys.key_blocks:
        if k.name in ['waist_width','pelvis_width','hip_volume','thigh_girth'] or k.name.startswith('garment_'):
            k.slider_min=-1 if 'abdomen' not in k.name else 0
assert set(k.name for k in pants.data.shape_keys.key_blocks)=={'Basis','garment_waist_width','garment_pelvis_width','garment_hip_volume','garment_thigh_girth'}
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.cycles.use_denoising=True
scene.render.resolution_x=320;scene.render.resolution_y=480;scene.render.resolution_percentage=100
scene.world.color=(.3,.3,.3)
def aim(o):o.rotation_euler=(Vector((0,0,.85))-o.location).to_track_quat('-Z','Y').to_euler()
for loc in [(2,-3,3),(-2,3,3),(-3,-1,2)]:
    data=bpy.data.lights.new('Softbox','AREA');data.energy=250;data.size=3
    o=bpy.data.objects.new('Softbox',data);scene.collection.objects.link(o);o.location=loc;aim(o)
data=bpy.data.cameras.new('OutfitCamera');data.type='ORTHO';data.ortho_scale=1.9
cam=bpy.data.objects.new('OutfitCamera',data);scene.collection.objects.link(cam);scene.camera=cam
states=[('base',{}),('pelvis_min_hip_max',{'pelvis_width':-1,'hip_volume':1}),
        ('waist_max_thigh_min',{'waist_width':1,'thigh_girth':-1}),
        ('abdomen_max_pelvis_min',{'abdomen_front':.8,'pelvis_width':-1}),
        ('signed_corner',{'waist_width':-1,'pelvis_width':-1,'hip_volume':1,'thigh_girth':1})]
checks=[]
for label,weights in states:
    for obj in [body,top,pants]:
        for k in obj.data.shape_keys.key_blocks:k.value=defaults[obj][k.name]
        for name,value in weights.items():
            target=name if obj==body else 'garment_'+name
            if target in obj.data.shape_keys.key_blocks:obj.data.shape_keys.key_blocks[target].value=value
    bpy.context.view_layer.update()
    evaluated=pants.evaluated_get(bpy.context.evaluated_depsgraph_get());m=evaluated.to_mesh()
    actual=np.array([v.co[:] for v in m.vertices]);keys=pants.data.shape_keys.key_blocks
    basis=np.array([v.co[:] for v in keys[0].data]);expected=basis.copy()
    for k in list(keys)[1:]:expected+=k.value*(np.array([v.co[:] for v in k.data])-basis)
    assert np.allclose(actual,expected,atol=2e-7)
    checks.append({'state':label,'exported_blender_vertices_match':True,'max_displacement_m':float(np.linalg.norm(actual-basis,axis=1).max())})
    evaluated.to_mesh_clear()
    for view,loc in [('front',(0,-3,.85)),('side',(3,0,.85)),('back',(0,3,.85))]:
        path=out/f'{label}_{view}.png';assert not path.exists()
        cam.location=loc;aim(cam);scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
(out/'exported_vertex_checks.json').write_text(json.dumps(checks,indent=2),encoding='utf8')
print('ONFIT_PANTS_RENDERED',len(states)*3)
