"""Run on the v2 BLEND; render torso comparisons with Cycles CPU, no source saves."""
import bpy
import sys
from pathlib import Path
from mathutils import Vector

root = Path(sys.argv[sys.argv.index('--')+1]).resolve()
version = sys.argv[sys.argv.index('--')+2] if len(sys.argv)>sys.argv.index('--')+2 else 'v2'
out = root.parent/f'assets/blender/previews/garment_{version}_final'
out.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
shirt = next(o for o in scene.objects if o.type == 'MESH' and 'garment_abdomen_front' in o.data.shape_keys.key_blocks)
body = next(o for o in scene.objects if o.type == 'MESH' and 'abdomen_front' in o.data.shape_keys.key_blocks)
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 12
scene.cycles.use_denoising = True
scene.render.resolution_x = 360
scene.render.resolution_y = 440
scene.render.resolution_percentage = 100
scene.world.color = (.3,.3,.3)
scene.view_settings.view_transform = 'AgX'
def aim(obj, point): obj.rotation_euler = (Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()
for name, location, energy in [('Front',(2,-3,3),350),('Back',(-2,3,3),350),('Side',(-3,-1,2),200)]:
    data = bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=3
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=location; aim(obj,(0,0,1.1))
data=bpy.data.cameras.new('ComparisonCamera'); data.type='ORTHO'; data.ortho_scale=.95
camera=bpy.data.objects.new('ComparisonCamera',data); scene.collection.objects.link(camera); scene.camera=camera
def render(label, a, p, garment, extra=None):
    for obj,prefix in [(body,''),(garment,'garment_')]:
        weights={'abdomen_front':a,'pelvis_width':p,'shoulder_width':0,'chest_volume':0,'waist_width':0,**(extra or {})}
        for name,weight in weights.items():
            key=obj.data.shape_keys.key_blocks.get(prefix+name)
            if key:
                if name!='abdomen_front':key.slider_min=-1
                key.value=weight
    for view,loc in [('front',(0,-3,1.14)),('side',(3,0,1.14)),('back',(0,3,1.14))]:
        camera.location=loc; aim(camera,(0,-.02,1.10))
        path=out/f'{label}_{view}.png'
        if path.exists(): raise RuntimeError('Refusing to replace render')
        scene.render.filepath=str(path); bpy.ops.render.render(write_still=True)
if version=='v3':
    render('base',0,0,shirt)
    render('minimum',0,-1,shirt,{'shoulder_width':-1,'chest_volume':-1,'waist_width':-1})
    render('maximum',.8,1,shirt,{'shoulder_width':1,'chest_volume':1,'waist_width':1})
    render('mixed',.8,-1,shirt,{'shoulder_width':1,'chest_volume':1,'waist_width':-1})
else:
    for label,a,p in [('base',0,0),('middle',.5,0),('maximum',1,0),('maximum_narrow',1,-1),('wide',0,1)]:
        render(label,a,p,shirt)
    shirt.hide_render=True
    bpy.ops.import_scene.gltf(filepath=str(root/'public/models/ONFIT_TShirt_BodyMorph_v1.glb'))
    old=next(o for o in bpy.context.selected_objects if o.type=='MESH')
    render('v1_maximum',1,0,old)
print('ONFIT_RENDERS',str(out))
