"""Bake sculpted high-resolution abdominal/pectoral detail onto existing UVs.
QA meshes only; source GLB/BLEND files are read-only. Cycles CPU, no downloads.
"""
import bpy,sys,json
import numpy as np
from pathlib import Path
from mathutils import Vector
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
output=root/'public/models/ONFIT_Muscle_Detail_v3.png'
blend=root.parent/'assets/blender/ONFIT_Muscle_Detail_v3.blend'
out=root.parent/'assets/blender/previews/muscle_detail_v3';out.mkdir(parents=True,exist_ok=True)
assert not output.exists() and not blend.exists(),'Refusing overwrite'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'public/models/ONFIT_Human_BodyBuild_v10.glb'))
body=next(o for o in bpy.context.selected_objects if o.type=='MESH')
keys=body.data.shape_keys.key_blocks
keys['body_build_muscular'].value=1;keys['body_abdominal_definition'].value=1
bpy.context.view_layer.update()
mesh=bpy.data.meshes.new_from_object(body.evaluated_get(bpy.context.evaluated_depsgraph_get()))
low=bpy.data.objects.new('Low_Muscular',mesh);bpy.context.scene.collection.objects.link(low);low.matrix_world=body.matrix_world.copy()
low.data.normals_split_custom_set([(0,0,0)]*len(low.data.loops))
body.hide_render=True;body.hide_set(True)
high=low.copy();high.data=low.data.copy();high.name='High_Sculpt';bpy.context.scene.collection.objects.link(high)
bpy.ops.object.select_all(action='DESELECT');high.select_set(True);bpy.context.view_layer.objects.active=high
sub=high.modifiers.new('HighResolutionSculpt','SUBSURF');sub.levels=2;sub.render_levels=2
bpy.ops.object.modifier_apply(modifier=sub.name)
coords=np.array([v.co[:] for v in high.data.vertices]);x,y,z=coords.T
def smooth(a,b,v):
    t=np.clip((v-a)/(b-a),0,1);return t*t*(3-2*t)
normals=np.array([v.normal[:] for v in high.data.vertices])
front=smooth(.2,.7,-normals[:,1])*(1-smooth(.15,.19,np.abs(x)))
support=smooth(1.01,1.045,z)*(1-smooth(1.185,1.215,z))*(1-smooth(.095,.135,np.abs(x)))*front
# Localized paired contours; no continuous horizontal bands across the torso.
sculpt=.0015*np.exp(-.5*(x/.008)**2)*support
for cx in [-.042,.042]:
    lateral=np.exp(-.5*((x-cx)/.022)**2)
    for cz in [1.09,1.14]:sculpt+=.0018*lateral*np.exp(-.5*((z-cz)/.005)**2)*support
    for cz in [1.065,1.115,1.165]:sculpt-=.0025*lateral*np.exp(-.5*((z-cz)/.019)**2)*support
pec_support=smooth(1.20,1.23,z)*(1-smooth(1.34,1.39,z))*front
sculpt+=.0015*np.exp(-.5*(x/.008)**2)*pec_support
for cx in [-.075,.075]:
    arc=1.205+.015*((x-cx)/.055)**2
    sculpt+=.0012*np.exp(-.5*((z-arc)/.004)**2)*np.exp(-.5*((x-cx)/.04)**2)*front
back=smooth(.2,.7,normals[:,1])
back_support=smooth(.98,1.05,z)*(1-smooth(1.34,1.43,z))*back
for cx in [-.026,.026]:sculpt+=.0016*np.exp(-.5*((x-cx)/.016)**2)*back_support
sculpt-=.0012*np.exp(-.5*(x/.009)**2)*back_support
for cx in [-.075,.075]:
    sculpt+=.0015*np.exp(-.5*((x-cx)/.035)**2-.5*((z-1.34)/.05)**2)*back
    arc=1.27+.45*np.abs(x)
    scapula=np.exp(-.5*((z-arc)/.008)**2)*np.exp(-.5*((x-cx)/.04)**2)
    sculpt-=.0009*scapula*back
coords[:,1]+=sculpt
high.data.vertices.foreach_set('co',coords.ravel());high.data.update()
high.data.normals_split_custom_set([(0,0,0)]*len(high.data.loops))

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8
image=bpy.data.images.new('MuscleTangentNormals',width=2048,height=2048,alpha=False)
image.colorspace_settings.name='Non-Color';image.generated_color=(.5,.5,1,1)
material=bpy.data.materials.new('MuscleDetail');material.use_nodes=True
nodes=material.node_tree.nodes;bsdf=nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value=(.45,.45,.45,1);bsdf.inputs['Roughness'].default_value=.72
texture=nodes.new('ShaderNodeTexImage');texture.image=image;nodes.active=texture
low.data.materials.clear();low.data.materials.append(material)
# Use a neutral source material; never bake an existing product texture.
high.data.materials.clear();source_material=bpy.data.materials.new('SculptSource');source_material.diffuse_color=(.45,.45,.45,1);high.data.materials.append(source_material)
bpy.ops.object.select_all(action='DESELECT');high.select_set(True);low.select_set(True);bpy.context.view_layer.objects.active=low
scene.render.bake.use_selected_to_active=True;scene.render.bake.cage_extrusion=.04;scene.render.bake.max_ray_distance=.08
bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT',use_selected_to_active=True,margin=12,cage_extrusion=.04,max_ray_distance=.08)
image.filepath_raw=str(output);image.file_format='PNG';image.save()
normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=1.0
material.node_tree.links.new(texture.outputs['Color'],normal.inputs['Color']);material.node_tree.links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
high.hide_render=True;high.hide_set(True)
scene.render.resolution_x=480;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.cycles.use_denoising=True
world=bpy.data.worlds.new('Studio');world.color=(.12,.12,.12);scene.world=world
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,energy,size in [('Key',(-2,-3,3),260,1.4),('Fill',(2,-2,2),80,2)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;aim(obj,(0,0,1.1))
data=bpy.data.cameras.new('QA');data.type='ORTHO';data.ortho_scale=.66
cam=bpy.data.objects.new('QA',data);scene.collection.objects.link(cam);scene.camera=cam;cam.location=(0,-3,1.12);aim(cam,(0,0,1.12))
for strength,label in [(0,'before'),(1,'after')]:
    normal.inputs['Strength'].default_value=strength
    path=out/f'{label}.png';assert not path.exists();scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
normal.inputs['Strength'].default_value=1
# Reference-style full-body views, with exactly the same material and map.
data.ortho_scale=1.85
for view,location in [('front',(0,-3,.85)),('side',(3,0,.85)),('back',(0,3,.85))]:
    cam.location=location;aim(cam,(0,0,.85))
    path=out/f'athletic_{view}.png';assert not path.exists();scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
report={'source':'ONFIT_Human_BodyBuild_v10.glb','output':str(output),'resolution':2048,'sculpt_vertices':len(coords),'max_extra_sculpt_m':float(np.max(np.abs(sculpt))),
    'method':'Tangent-space normals baked from subdivided and sculpted geometry; not an image overlay','browser_verified':False}
output.with_suffix('.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('ONFIT_MUSCLE_DETAIL',json.dumps(report))
