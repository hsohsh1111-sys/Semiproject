"""Blender 5.2: fit the installed CC0 system costume and export its shirt only.

Invoke with SOURCE.blend --python this.py -- --asset FILE.mhclo
--blend-output FILE.blend --glb-output FILE.glb. Original inputs are never saved.
Existing output files are copied to timestamped backups before replacement.
"""
import argparse
from datetime import datetime
import hashlib
import importlib
import json
from pathlib import Path
import shutil
import sys

import addon_utils
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def backup(path):
    if path.exists():
        destination = path.with_name(path.stem + '_backup_' + datetime.now().strftime('%Y%m%d_%H%M%S_%f') + path.suffix)
        shutil.copy2(path, destination)
        if sha256(path) != sha256(destination):
            raise RuntimeError('Output backup verification failed')
        return str(destination)
    return None


def components(mesh):
    parent = list(range(len(mesh.vertices)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for edge in mesh.edges:
        a, b = edge.vertices
        parent[root(a)] = root(b)
    groups = {}
    for i in range(len(parent)):
        groups.setdefault(root(i), []).append(i)
    return list(groups.values())


args = argparse.ArgumentParser()
args.add_argument('--asset', type=Path, required=True)
args.add_argument('--blend-output', type=Path, required=True)
args.add_argument('--glb-output', type=Path, required=True)
args.add_argument('--component', choices=['shirt', 'pants', 'outer', 'long_sleeve'], default='shirt')
args.add_argument('--shirt-reference', type=Path)
options = args.parse_args(sys.argv[sys.argv.index('--') + 1:])
source = Path(bpy.data.filepath)
source_hash, asset_hash = sha256(source), sha256(options.asset)
if source.resolve() == options.blend_output.resolve():
    raise RuntimeError('Refusing to overwrite source blend')
if 'explicitly released as CC0' not in options.asset.read_text(encoding='utf8')[:1500]:
    raise RuntimeError('CC0 declaration not found in the installed asset')

module = 'bl_ext.blender_org.mpfb'
if not addon_utils.check(module)[1]:
    # Factory-startup needs an in-memory preference entry for MPFB services.
    # No save_userpref call: the user's persistent settings are not rewritten.
    addon_utils.enable(module, default_set=True, persistent=False)
mpfb = importlib.import_module(module)
services = importlib.import_module(module + '.services')
body = bpy.data.objects.get('Human')
if body is None or not services.ObjectService.object_is_basemesh(body):
    raise RuntimeError('Human is not a compatible MPFB base mesh')
body_keys = [(k.name, k.value) for k in body.data.shape_keys.key_blocks]
old_modifiers = {m.name for m in body.modifiers}
old_groups = {g.name for g in body.vertex_groups}
depsgraph = bpy.context.evaluated_depsgraph_get()
body_mesh = body.evaluated_get(depsgraph).to_mesh()
body_mesh.calc_loop_triangles()
body_vertices = [body.matrix_world @ v.co for v in body_mesh.vertices]
body_triangles = [list(t.vertices) for t in body_mesh.loop_triangles]
body_bvh = BVHTree.FromPolygons(body_vertices, body_triangles, all_triangles=True)
body.evaluated_get(depsgraph).to_mesh_clear()
body_height = max(p.z for p in body_vertices) - min(p.z for p in body_vertices)

bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
costume = services.HumanService.add_mhclo_asset(
    str(options.asset.resolve()), body, asset_type='Clothes', subdiv_levels=0,
    material_type='GAMEENGINE', set_up_rigging=False, interpolate_weights=False,
    import_subrig=False, import_weights=False,
)
groups = components(costume.data)
if len(groups) != 2 and options.component != 'outer':
    raise RuntimeError(f'Expected separate shirt and trousers; found {len(groups)} mesh components')
choose = min if options.component == 'pants' else max
if options.component == 'outer':
    # male_casualsuit05 also bundles a striped inner shirt, neckline insert and
    # jeans. Its connected long-sleeve jacket shell is the largest upper piece.
    candidates=[ids for ids in groups if min((costume.matrix_world@costume.data.vertices[i].co).z for i in ids)>body_height*.35]
    shirt_ids=max(candidates,key=len)
    print('OUTER_COMPONENTS',json.dumps([{'vertices':len(ids),'min_z':min((costume.matrix_world@costume.data.vertices[i].co).z for i in ids),
        'max_z':max((costume.matrix_world@costume.data.vertices[i].co).z for i in ids)} for ids in groups]),flush=True)
else:
    shirt_ids = choose(groups, key=lambda ids: sum((costume.matrix_world @ costume.data.vertices[i].co).z for i in ids) / len(ids))
shirt_min = min((costume.matrix_world @ costume.data.vertices[i].co).z for i in shirt_ids)
if options.component in ['shirt', 'outer', 'long_sleeve'] and shirt_min < body_height * .35:
    raise RuntimeError('Upper component is not a torso-length shirt')
if options.component == 'pants':
    pants_max = max((costume.matrix_world @ costume.data.vertices[i].co).z for i in shirt_ids)
    if shirt_min > body_height*.20 or pants_max > body_height*.70 or pants_max < body_height*.45:
        raise RuntimeError('Lower component does not have expected full-length pants bounds')
keep = set(shirt_ids)
bpy.ops.object.select_all(action='DESELECT')
costume.select_set(True)
bpy.context.view_layer.objects.active = costume
for polygon in costume.data.polygons:
    polygon.select = False
for edge in costume.data.edges:
    edge.select = False
for vertex in costume.data.vertices:
    vertex.select = vertex.index not in keep
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='VERT')
bpy.ops.object.mode_set(mode='OBJECT')

# A full-costume delete mask must not hide bare legs when only its shirt remains.
for modifier in list(body.modifiers):
    if modifier.name not in old_modifiers:
        body.modifiers.remove(modifier)
for group in list(body.vertex_groups):
    if group.name not in old_groups:
        body.vertex_groups.remove(group)
if body_keys != [(k.name, k.value) for k in body.data.shape_keys.key_blocks]:
    raise RuntimeError('Original body Shape Keys changed')

world = costume.matrix_world.copy()
costume.parent = None
costume.matrix_world = world
costume.name = {'pants':'ONFIT_Pants','shirt':'ONFIT_TShirt','outer':'ONFIT_Outer','long_sleeve':'ONFIT_LongSleeve'}[options.component]
modifier = costume.modifiers.new('Asset surface refinement', 'SUBSURF')
modifier.levels = modifier.render_levels = 1
bpy.context.view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()
fitted_mesh = bpy.data.meshes.new_from_object(costume.evaluated_get(depsgraph), depsgraph=depsgraph)
costume.data = fitted_mesh
for modifier in list(costume.modifiers):
    costume.modifiers.remove(modifier)
for polygon in fitted_mesh.polygons:
    polygon.use_smooth = True
fitted_mesh.update()
costume['source_asset'] = f'{options.asset.stem} ({options.component} component only)'
costume['license'] = 'CC0'
costume['deformation_support'] = 'Static fit to current Human shape; no garment Morph Targets'

clearance_correction = 0.0
shirt_hash = None
if options.component == 'long_sleeve':
    inverse=costume.matrix_world.inverted()
    for vertex in fitted_mesh.vertices:
        point=costume.matrix_world@vertex.co
        q,n,_,_=body_bvh.find_nearest(point)
        gap=(point-q).dot(n)
        correction=max(0,min(.015,.004-gap))
        vertex.co=inverse@(point+n*correction)
        clearance_correction=max(clearance_correction,correction)
    fitted_mesh.update()
if options.component == 'pants':
    top_bvh = None
    if options.shirt_reference:
        shirt_hash = sha256(options.shirt_reference)
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(options.shirt_reference.resolve()))
        top = next(o for o in set(bpy.data.objects)-before if o.type == 'MESH')
        top_eval = top.evaluated_get(bpy.context.evaluated_depsgraph_get())
        top_mesh = top_eval.to_mesh(); top_mesh.calc_loop_triangles()
        top_bvh = BVHTree.FromPolygons([top.matrix_world @ v.co for v in top_mesh.vertices],
                                      [list(t.vertices) for t in top_mesh.loop_triangles], all_triangles=True)
        top_eval.to_mesh_clear()
    inverse = costume.matrix_world.inverted()
    for vertex in fitted_mesh.vertices:
        original_point = costume.matrix_world @ vertex.co
        nearest, normal, _, _ = body_bvh.find_nearest(original_point)
        gap = (original_point-nearest).dot(normal)
        desired = max(gap, .004)
        if top_bvh:
            hit, hit_normal, _, distance = top_bvh.ray_cast(nearest+normal*.0001, normal, .08)
            if hit is not None and hit_normal.dot(normal) > .2:
                # Leave room under the existing top where its surface covers us.
                desired = min(desired, max(.001, distance-.002))
        correction = max(-.015, min(.015, desired-gap))
        vertex.co = inverse @ (original_point+normal*correction)
        clearance_correction = max(clearance_correction, abs(correction))
    fitted_mesh.update()

if options.component == 'outer':
    if not options.shirt_reference:
        raise RuntimeError('Outer fitting needs the actual inner-shirt reference')
    shirt_hash=sha256(options.shirt_reference)
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(options.shirt_reference.resolve()))
    top=next(o for o in set(bpy.data.objects)-before if o.type=='MESH')
    evaluated=top.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
    top_bvh=BVHTree.FromPolygons([top.matrix_world@v.co for v in mesh.vertices],
                                 [list(t.vertices) for t in mesh.loop_triangles],all_triangles=True)
    evaluated.to_mesh_clear()
    inverse=costume.matrix_world.inverted()
    # Local ease only where an actual inner surface is too close. No global
    # scaling, invented sleeves, or hiding of either garment/body mesh.
    for vertex in fitted_mesh.vertices:
        original_point=costume.matrix_world@vertex.co
        point=original_point.copy()
        for _ in range(3):
            _,body_normal,_,_=body_bvh.find_nearest(point)
            for surface,clearance in [(body_bvh,.004),(top_bvh,.005)]:
                q,n,_,distance=surface.find_nearest(point)
                gap=(point-q).dot(n)
                # At the shirt's open sleeve/hem, the nearest surface can be
                # on the opposite side. Only use matching outward directions.
                if distance<.04 and gap<clearance and (surface==body_bvh or n.dot(body_normal)>.35):
                    point+=n*min(.012,clearance-gap)
        movement=point-original_point
        if movement.length>.025:
            point=original_point+movement.normalized()*.025
            movement=point-original_point
        vertex.co=inverse@point
        clearance_correction=max(clearance_correction,movement.length)
    fitted_mesh.update()

signed_distances = []
for vertex in fitted_mesh.vertices:
    p = costume.matrix_world @ vertex.co
    nearest, normal, _, _ = body_bvh.find_nearest(p)
    if nearest is not None:
        signed_distances.append((p - nearest).dot(normal))
penetration = {
    'samples': len(signed_distances),
    'inside_over_2mm': sum(d < -.002 for d in signed_distances),
    'inside_over_10mm': sum(d < -.01 for d in signed_distances),
    'max_inside_m': max(0, -min(signed_distances)),
    'method': 'Nearest-surface normal estimate; not full cloth collision simulation',
}
if penetration['inside_over_10mm'] > len(signed_distances) * .03:
    raise RuntimeError('Large body penetration detected: ' + json.dumps(penetration))
if not fitted_mesh.uv_layers:
    raise RuntimeError('Clothing UV layer was lost')
# The source MHMAT explicitly marks this fabric opaque. GameEngine node trees
# can nevertheless link PNG alpha, making glTF export it as BLEND unnecessarily.
if 'transparent False' in options.asset.with_suffix('.mhmat').read_text(encoding='utf8'):
    for material in fitted_mesh.materials:
        if material and material.node_tree:
            for node in material.node_tree.nodes:
                if node.type == 'BSDF_PRINCIPLED':
                    alpha = node.inputs.get('Alpha')
                    for link in list(alpha.links):
                        material.node_tree.links.remove(link)
                    alpha.default_value = 1.0
image_nodes = [node for material in fitted_mesh.materials if material and material.node_tree
               for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image]
if not image_nodes:
    raise RuntimeError('Authored material textures could not be loaded')
for node in image_nodes:
    node.image.pack()

options.blend_output.parent.mkdir(parents=True, exist_ok=True)
options.glb_output.parent.mkdir(parents=True, exist_ok=True)
report_path = options.blend_output.parent / options.glb_output.with_suffix('.source.json').name
backups = [p for p in (backup(options.blend_output), backup(options.glb_output), backup(report_path)) if p]
# Selection-only export must not pull the Human base mesh into the garment file.
bpy.ops.object.select_all(action='DESELECT')
costume.select_set(True)
bpy.context.view_layer.objects.active = costume
bpy.ops.wm.save_as_mainfile(filepath=str(options.blend_output.resolve()))
bpy.ops.export_scene.gltf(filepath=str(options.glb_output.resolve()), export_format='GLB',
                          use_selection=True, export_apply=True, export_animations=False)
if sha256(source) != source_hash or sha256(options.asset) != asset_hash:
    raise RuntimeError('Original input unexpectedly changed')
if options.shirt_reference and sha256(options.shirt_reference) != shirt_hash:
    raise RuntimeError('Shirt reference unexpectedly changed')
fitted_mesh.calc_loop_triangles()
vertices = [costume.matrix_world @ v.co for v in fitted_mesh.vertices]
# Blender Z-up -> standard glTF Y-up; no additional recentering or scale.
glb_points = [(p.x, p.z, -p.y) for p in vertices]
report = {
    'blender': bpy.app.version_string, 'mpfb': '.'.join(map(str, mpfb.VERSION)),
    'source_blend': str(source), 'source_blend_sha256': source_hash,
    'asset': str(options.asset), 'asset_sha256': asset_hash,
    'asset_name': options.asset.stem, 'extracted_component': {'pants':'full-length pants','shirt':'round-neck short-sleeve shirt','outer':'long-sleeve padded jacket with authored front closure','long_sleeve':'round-neck long-sleeve top'}[options.component],
    'license': 'CC0', 'license_url': 'https://www.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html',
    'blend_output': str(options.blend_output.resolve()), 'glb_output': str(options.glb_output.resolve()),
    'glb_sha256': sha256(options.glb_output), 'vertices': len(fitted_mesh.vertices),
    'triangles': len(fitted_mesh.loop_triangles), 'texture_nodes': len(image_nodes),
    'bounds': {'min': [min(p[i] for p in glb_points) for i in range(3)],
               'max': [max(p[i] for p in glb_points) for i in range(3)]},
    'penetration_check': penetration, 'morph_targets': 0, 'backups': backups,
    'max_clearance_correction_m': clearance_correction,
    'shirt_reference_sha256': shirt_hash,
    'visual_verification': False,
}
report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
print('ONFIT_MPFB_EXPORT', json.dumps(report, ensure_ascii=True))
