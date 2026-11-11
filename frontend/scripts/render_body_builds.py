"""Render macro-only body comparisons without modifying any BLEND/GLB."""
import bpy,sys
from pathlib import Path
from mathutils import Vector
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
version=sys.argv[sys.argv.index('--')+2] if len(sys.argv)>sys.argv.index('--')+2 else 'v10'
label=sys.argv[sys.argv.index('--')+3] if len(sys.argv)>sys.argv.index('--')+3 else version
out=root.parent/f'assets/blender/previews/body_builds_{label}';out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/f'public/models/ONFIT_Human_BodyBuild_{version}.glb'))
body=next(o for o in bpy.context.selected_objects if o.type=='MESH')
# glTF imports split normals for its default pose. Recalculate preview shading
# from the evaluated shape, so static imported normals cannot hide sculpting.
body.data.normals_split_custom_set([(0,0,0)]*len(body.data.loops))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.render.resolution_x=480;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.world.color=(.22,.22,.22);scene.view_settings.view_transform='AgX'
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power in [('Key',(-2,-3,3),350),('Fill',(2,-1,2),100),('Rim',(1,3,3),250)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=3
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;aim(o,(0,0,1))
data=bpy.data.cameras.new('Compare');data.type='ORTHO';data.ortho_scale=1.85
cam=bpy.data.objects.new('Compare',data);scene.collection.objects.link(cam);scene.camera=cam
keys=body.data.shape_keys.key_blocks
for label,target in [('average',None),('lean','body_build_lean'),('muscular','body_build_muscular')]:
    keys['body_build_lean'].value=keys['body_build_muscular'].value=0
    if target:keys[target].value=1
    if 'body_abdominal_definition' in keys:keys['body_abdominal_definition'].value=1 if label=='muscular' else 0
    for view,loc in [('front',(0,-3,.85)),('side',(3,0,.85)),('back',(0,3,.85))]:
        path=out/f'{label}_{view}.png';assert not path.exists(),'Refusing overwrite'
        cam.location=loc;aim(cam,(0,0,.85));scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    if label=='muscular':
        data.ortho_scale=.62;cam.location=(0,-3,1.12);aim(cam,(0,-.04,1.12))
        path=out/'muscular_abs.png';assert not path.exists()
        scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
        # Additional raking-light diagnostic for the actual abdominal relief.
        # This is not a replacement for the balanced-light comparisons above.
        bpy.data.objects['Fill'].hide_render=True;bpy.data.objects['Rim'].hide_render=True
        key=bpy.data.objects['Key'];key.location=(-1,-2,1.6);key.data.size=.7;key.data.energy=200;aim(key,(0,-.04,1.12))
        scene.world.color=(.05,.05,.05)
        path=out/'muscular_abs_raking.png';assert not path.exists()
        scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
print('ONFIT_BODY_BUILD_RENDERS',str(out))
