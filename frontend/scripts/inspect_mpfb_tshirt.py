"""Read a prepared work .blend and render three CPU previews without saving it."""
import argparse
from pathlib import Path
import sys
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--output-dir', type=Path, required=True)
options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
options.output_dir.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 12
scene.cycles.use_denoising = False
scene.render.resolution_x = 512
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.6, .65, .7, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .5
target = Vector((0, 0, .83))
camera_data = bpy.data.cameras.new('ONFIT_VerificationCamera')
camera = bpy.data.objects.new('ONFIT_VerificationCamera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 1.9
for name, position, energy in [('key', (-3, -4, 5), 400), ('fill', (3, 3, 4), 350)]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.shape = 'DISK'
    data.size = 4
    light = bpy.data.objects.new(name, data)
    scene.collection.objects.link(light)
    light.location = position
    light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()
for name, location in [('front', (0, -4, .83)), ('side', (4, 0, .83)), ('back', (0, 4, .83))]:
    camera.location = location
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str((options.output_dir / f'ONFIT_TShirt_{name}.png').resolve())
    bpy.ops.render.render(write_still=True)
print('ONFIT_PREVIEWS_DONE')
