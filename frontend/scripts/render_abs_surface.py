"""Bake evaluated shape vertices into QA-only meshes to verify sculpt shading."""
import bpy,sys
from pathlib import Path
from mathutils import Vector
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
out=root.parent/'assets/blender/previews/abs_surface_v5';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'public/models/ONFIT_Human_BodyBuild_v5.glb'))
body=next(o for o in bpy.context.selected_objects if o.type=='MESH');keys=body.data.shape_keys.key_blocks
keys['body_build_muscular'].value=1
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.render.resolution_x=480;scene.render.resolution_y=720;scene.render.resolution_percentage=100
world=bpy.data.worlds.new('QA');world.color=(.06,.06,.06);scene.world=world
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
light=bpy.data.lights.new('Key','AREA');light.energy=160;light.size=.7
obj=bpy.data.objects.new('Key',light);scene.collection.objects.link(obj);obj.location=(-1,-2,1.7);aim(obj,(0,-.03,1.12))
data=bpy.data.cameras.new('QA');data.type='ORTHO';data.ortho_scale=.62
cam=bpy.data.objects.new('QA',data);scene.collection.objects.link(cam);scene.camera=cam;cam.location=(0,-3,1.12);aim(cam,(0,0,1.12))
for weight in [0,1]:
    keys['body_abdominal_definition'].value=weight;bpy.context.view_layer.update()
    evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
    vertices=[body.matrix_world@v.co for v in mesh.vertices];polygons=[list(p.vertices) for p in mesh.polygons]
    evaluated.to_mesh_clear()
    baked=bpy.data.meshes.new('EvaluatedVertices');baked.from_pydata(vertices,[],polygons);baked.update()
    for p in baked.polygons:p.use_smooth=True
    preview=bpy.data.objects.new('EvaluatedPreview',baked);scene.collection.objects.link(preview)
    body.hide_render=True
    path=out/f'abs_{weight}.png';assert not path.exists();scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    preview.hide_render=True
print('ONFIT_ABS_SURFACE',str(out))
