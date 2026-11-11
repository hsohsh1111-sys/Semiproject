"""Render the actual v3 GLB with signed lower-body keys; no assets are saved."""
import bpy
import sys
from pathlib import Path
from mathutils import Vector
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
out=root.parent/'assets/blender/previews/body_v3_lower'
out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=str(root/'public/models/ONFIT_Human_BodyMorph_v3.glb'))
body=next(o for o in bpy.context.selected_objects if o.type=='MESH')
keys=body.data.shape_keys.key_blocks
for name in ['hip_volume','thigh_girth','pelvis_width']:keys[name].slider_min=-1
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU'
scene.cycles.samples=8;scene.cycles.use_denoising=True
scene.render.resolution_x=320;scene.render.resolution_y=400;scene.render.resolution_percentage=100
scene.world.color=(.3,.3,.3)
def aim(obj):obj.rotation_euler=(Vector((0,0,.73))-obj.location).to_track_quat('-Z','Y').to_euler()
for location in [(2,-3,2),(-2,3,2)]:
    data=bpy.data.lights.new('Softbox','AREA');data.energy=300;data.size=3
    obj=bpy.data.objects.new('Softbox',data);scene.collection.objects.link(obj);obj.location=location;aim(obj)
data=bpy.data.cameras.new('LowerBodyCamera');data.type='ORTHO';data.ortho_scale=1.2
camera=bpy.data.objects.new('LowerBodyCamera',data);scene.collection.objects.link(camera);scene.camera=camera
for label,hip,thigh,pelvis,abdomen in [
    ('base',0,0,0,0),('hip_plus',1,0,0,0),('hip_minus',-1,0,0,0),
    ('thigh_plus',0,1,0,0),('thigh_minus',0,-1,0,0),('both_plus',1,1,0,0),
    ('narrow_hip_plus',1,0,-1,0),('abdomen_hip_minus',-1,0,0,.8)]:
    for key,value in [('hip_volume',hip),('thigh_girth',thigh),('pelvis_width',pelvis),('abdomen_front',abdomen)]:keys[key].value=value
    for view,position in [('front',(0,-3,.73)),('side',(3,0,.73)),('back',(0,3,.73))]:
        camera.location=position;aim(camera);path=out/f'{label}_{view}.png'
        assert not path.exists(),'Refusing to overwrite render'
        scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
print('ONFIT_LOWER_RENDERS',str(out))
