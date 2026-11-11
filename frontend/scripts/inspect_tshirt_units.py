"""Read-only unit/source inspection for the existing tee blend."""
import bpy,json,sys
from pathlib import Path
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
report={'blend':bpy.data.filepath,'system':bpy.context.scene.unit_settings.system,'scale_length':bpy.context.scene.unit_settings.scale_length,
        'meshes':[{'name':o.name,'scale':list(o.scale),'vertices':len(o.data.vertices)} for o in bpy.context.scene.objects if o.type=='MESH']}
path=root.parent/'assets/blender/previews/product_sizes_v2_units.json';assert not path.exists()
path.write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report))
