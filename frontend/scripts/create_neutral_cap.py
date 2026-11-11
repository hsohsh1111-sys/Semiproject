"""Create a plain cap derivative without touching geometry or source assets.

The print is solely in one albedo image. Replace that image with a NEW uniform
white PNG (material tint supplies color), not an edited/inpainted photograph.
Repack the GLB so the old printed image is absent even as unused binary data.
"""
import bpy
import hashlib
import json
from pathlib import Path
import struct
import sys
import zlib

root=Path(sys.argv[sys.argv.index('--')+1]).resolve();models=root/'public/models';assets=root.parent/'assets/blender'
source=models/'ONFIT_Cap_v1.glb';output=models/'ONFIT_Cap_Neutral_v1.glb';blend=assets/'ONFIT_Cap_Neutral_v1.blend'
texture=assets/'textures/ONFIT_Cap_Neutral_Albedo.png';report_path=assets/'ONFIT_Cap_Neutral_v1.source.json'
assert not any(p.exists() for p in [output,blend,texture,report_path]),'Refusing overwrite'
sha=lambda b:hashlib.sha256(b).hexdigest()
raw=source.read_bytes();source_hash=sha(raw);n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n])
length=struct.unpack_from('<I',raw,20+n)[0];old=raw[28+n:28+n+length]
assert len(doc['meshes'])==len(doc['materials'])==len(doc['images'])==1
assert len(doc['meshes'][0]['primitives'])==1
assert doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']==0
assert not doc['meshes'][0]['primitives'][0].get('targets')

# Technical constant albedo: no words, logos, masks, transparency or decoration.
def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',4,4,8,6,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+b'\xff'*16)*4))+chunk(b'IEND',b'')
texture.parent.mkdir(parents=True,exist_ok=True);texture.write_bytes(png)
binary=bytearray();geometry_hashes={}
image_view=doc['images'][0]['bufferView']
for i,view in enumerate(doc['bufferViews']):
    while len(binary)%4:binary.append(0)
    offset=len(binary)
    data=png if i==image_view else old[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
    binary.extend(data);view['byteOffset']=offset;view['byteLength']=len(data)
    if i!=image_view:geometry_hashes[str(i)]=sha(data)
doc['images'][0].update(name='ONFIT_Plain_White_Albedo',mimeType='image/png')
doc['meshes'][0]['name']='ONFIT_Cap_Neutral'
def linear(value):return value/12.92 if value<=.04045 else ((value+.055)/1.055)**2.4
black=[linear(v/255) for v in [0x16,0x18,0x1d]]
material=doc['materials'][0]
material.update(name='ONFIT_Neutral_Cap_Fabric',alphaMode='OPAQUE')
material['pbrMetallicRoughness'].update(baseColorFactor=black+[1],roughnessFactor=.88,metallicFactor=0)
doc['buffers'][0]['byteLength']=len(binary)
encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);binary+=b'\0'*(-len(binary)%4)
output.write_bytes(struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary)

# Inspect the derivative in Blender, retaining exact source coordinates.
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=str(output))
meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH'];assert len(meshes)==1
obj=meshes[0];assert obj.data.uv_layers and obj.data.shape_keys is None
for mat in obj.data.materials:
    if mat and mat.node_tree:
        for node in mat.node_tree.nodes:
            if node.type=='TEX_IMAGE' and node.image:node.image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
assert sha(source.read_bytes())==source_hash
report=dict(source=str(source),source_sha256=source_hash,output_sha256=sha(output.read_bytes()),
    license='CC0',source_asset='toigo_maga_hat',author='MargaretToigo / MRT',
    print_location='Single base-color texture; no separate text mesh',new_albedo=str(texture),new_albedo_sha256=sha(png),
    texture_kind='New 4x4 opaque white constant albedo; black material factor supplies default color',
    preserved_geometry_buffer_hashes=geometry_hashes,default_color='#16181D',
    vertices=len(obj.data.vertices),uv_layers=len(obj.data.uv_layers),browser_verified=False)
report_path.write_text(json.dumps(report,indent=2),encoding='utf8')
print('ONFIT_NEUTRAL_CAP',json.dumps(report))
