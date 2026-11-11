"""Small local skin/jeans clearances for the authored hood asset, no morphs."""
import bpy
import hashlib
import json
import sys
import struct
from pathlib import Path
from mathutils.bvhtree import BVHTree

root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
assets=root.parent/'assets/blender'; models=root/'public/models'
source=assets/'hooded_jacket_drafts/ONFIT_HoodedJacket_v1.initial.glb'
output=assets/'ONFIT_HoodedJacket_v1.blend'; glb=models/'ONFIT_HoodedJacket_v1.glb'
assert not output.exists() and not glb.exists()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete()
# Inspect the exact web body, including its default shape weights.
def load(name):
    before=set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=str(models/name))
    return next(o for o in set(bpy.data.objects)-before if o.type=='MESH')
body=load('ONFIT_Human_BodyMorph_v3.glb'); pants=load('ONFIT_Pants_BodyMorph_v2.glb')
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(source))
garment=next(o for o in set(bpy.data.objects)-before if o.type=='MESH')
def tree(obj):
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get()); mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
    result=BVHTree.FromPolygons([obj.matrix_world@v.co for v in mesh.vertices], [list(t.vertices) for t in mesh.loop_triangles],all_triangles=True)
    evaluated.to_mesh_clear();return result
skin=tree(body);jeans=tree(pants)
inverse=garment.matrix_world.inverted(); maximum=0; moved=0
for v in garment.data.vertices:
    start=garment.matrix_world@v.co; point=start.copy()
    # Only resolve near skin/denim contacts, leaving the loose hood alone.
    for _ in range(4):
        for surface,clearance in [(skin,.004),(jeans,.004)]:
            if surface is jeans and start.z>.98:continue
            if surface is skin and start.z>1.34 and abs(start.x)<.22:continue
            q,n,_,distance=surface.find_nearest(point)
            gap=(point-q).dot(n)
            if distance<.035 and gap<clearance:
                point+=n*min(.008,clearance-gap)
        delta=point-start
        if delta.length>.022:point=start+delta.normalized()*.022
    displacement=(point-start).length
    if displacement>1e-7:moved+=1
    maximum=max(maximum,displacement);v.co=inverse@point
garment.data.update()
for material in garment.data.materials:
    if material and material.node_tree:
        for node in material.node_tree.nodes:
            if node.type=='BSDF_PRINCIPLED':
                node.inputs['Roughness'].default_value=max(.8,node.inputs['Roughness'].default_value)
                node.inputs['Metallic'].default_value=0
                alpha=node.inputs['Alpha']
                for link in list(alpha.links):material.node_tree.links.remove(link)
                alpha.default_value=1
            if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.6
bpy.ops.object.select_all(action='DESELECT');garment.select_set(True);bpy.context.view_layer.objects.active=garment
bpy.ops.wm.save_as_mainfile(filepath=str(output))
# Append corrected attributes to the original GLB. A fresh triangulation of
# deformed quads can reorder triangles/UV splits; keep the authored buffers.
raw=source.read_bytes();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size])
length=struct.unpack_from('<I',raw,20+size)[0];binary=bytearray(raw[28+size:28+size+length])
primitive=doc['meshes'][0]['primitives'][0]
def attribute(values):
    data=b''.join(struct.pack('<fff',v[0],v[2],-v[1]) for v in values)
    while len(binary)%4:binary.append(0)
    offset=len(binary);binary.extend(data)
    doc['bufferViews'].append(dict(buffer=0,byteOffset=offset,byteLength=len(data)))
    converted=[(v[0],v[2],-v[1]) for v in values]
    doc['accessors'].append(dict(bufferView=len(doc['bufferViews'])-1,componentType=5126,
        count=len(values),type='VEC3',min=[min(v[i] for v in converted) for i in range(3)],max=[max(v[i] for v in converted) for i in range(3)]))
    return len(doc['accessors'])-1
primitive['attributes']['POSITION']=attribute([v.co[:] for v in garment.data.vertices])
primitive['attributes']['NORMAL']=attribute([v.normal[:] for v in garment.data.vertices])
for material in doc['materials']:
    material.setdefault('pbrMetallicRoughness',{}).update(roughnessFactor=.8,metallicFactor=0)
    material.pop('alphaCutoff',None);material['alphaMode']='OPAQUE'
    if 'normalTexture' in material:material['normalTexture']['scale']=.6
doc['buffers'][0]['byteLength']=len(binary)
j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*(-len(j)%4);binary+=b'\0'*(-len(binary)%4)
glb.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary)
manifest=assets/'ONFIT_HoodedJacket_v1.source.json';report=json.loads(manifest.read_text())
report.update(glb_sha256=hashlib.sha256(glb.read_bytes()).hexdigest(),local_clearance_max_m=maximum,
    adjusted_vertices=moved,modifications='MPFB body fit; local skin/jeans clearance capped 22mm; fabric roughness 0.8, metallic 0, authored normal texture strength 0.6; no morphs')
manifest.write_text(json.dumps(report,indent=2),encoding='utf8')
print('HOOD_LOCAL_FIT',moved,maximum)
