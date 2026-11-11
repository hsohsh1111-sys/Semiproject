"""Non-destructive Cycles CPU previews of exported female body/clothes."""
import bpy, sys, json
from pathlib import Path
from mathutils import Vector
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
out=root.parent/'assets/blender/previews/female_clothes_v6_skirt3'
out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
assets={}
for name,file in [('body','ONFIT_Human_Female_v2'),('shirt','ONFIT_TShirt_Female_v6'),('long','ONFIT_LongSleeve_Female_v6'),('pants','ONFIT_Pants_Female_v5'),('skirt','ONFIT_Skirt_Female_v3')]:
    bpy.ops.import_scene.gltf(filepath=str(root/f'public/models/{file}.glb'))
    assets[name]=list(bpy.context.selected_objects)
    for o in assets[name]:o.hide_render=True
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.cycles.use_denoising=True
scene.render.resolution_x=360;scene.render.resolution_y=540;scene.render.resolution_percentage=100
scene.world.color=(.22,.22,.22);scene.view_settings.view_transform='AgX'
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power in [('Key',(-2,-3,3),350),('Fill',(2,-1,2),180),('Rim',(1,3,3),250)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=3
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;aim(o,(0,0,1))
data=bpy.data.cameras.new('FemaleCompare');data.type='ORTHO';data.ortho_scale=1.85
cam=bpy.data.objects.new('FemaleCompare',data);scene.collection.objects.link(cam);scene.camera=cam
for label,clothes,view,loc in [
    ('shirt_front',['shirt','pants'],'front',(0,-3,.85)),
    ('shirt_side',['shirt','pants'],'side',(3,0,.85)),
    ('shirt_back',['shirt','pants'],'back',(0,3,.85)),
    ('long_front',['long','pants'],'front',(0,-3,.85)),
    ('long_side',['long','pants'],'side',(3,0,.85)),
    ('skirt_front',['shirt','skirt'],'front',(0,-3,.85)),
    ('skirt_side',['shirt','skirt'],'side',(3,0,.85)),
    ('skirt_back',['shirt','skirt'],'back',(0,3,.85)),
    ('long_skirt_front',['long','skirt'],'front',(0,-3,.85)),
    ('long_skirt_side',['long','skirt'],'side',(3,0,.85))]:
    for name,objects in assets.items():
        for o in objects:o.hide_render=name not in ['body',*clothes]
    path=out/f'{label}.png';assert not path.exists(),'Refusing overwrite'
    cam.location=loc;aim(cam,(0,0,.85));scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
print('ONFIT_FEMALE_PREVIEWS',out,flush=True)
