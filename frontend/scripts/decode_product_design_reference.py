"""Decode the existing user photo for a local crop-algorithm QA artifact only."""
import bpy
import json
from pathlib import Path
import sys
import numpy as np
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
source=root/'public/textures/nike-shirt-reference.png'
out=root.parent/'assets/blender/previews/product_design_v1'
out.mkdir(parents=True,exist_ok=True)
raw=out/'reference.rgba';metadata=out/'reference.json'
assert not raw.exists() and not metadata.exists(),'Refusing overwrite'
image=bpy.data.images.load(str(source));image.colorspace_settings.name='Non-Color'
width,height=image.size
# Blender's image rows are bottom-up; the browser ImageData contract is top-down.
pixels=np.array(image.pixels[:]).reshape(height,width,4)[::-1]
raw.write_bytes(np.rint(np.clip(pixels,0,1)*255).astype('uint8').tobytes())
metadata.write_text(json.dumps({'width':width,'height':height,'source':str(source),'note':'Local user-photo crop QA; not shop-verified or licensed for redistribution'}),encoding='utf8')
