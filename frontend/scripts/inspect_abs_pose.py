import bpy,sys,json
from pathlib import Path
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'public/models/ONFIT_Human_BodyBuild_v5.glb'))
b=next(o for o in bpy.context.selected_objects if o.type=='MESH');k=b.data.shape_keys.key_blocks
for name in ['body_build_muscular','body_abdominal_definition']:k[name].value=1
bpy.context.view_layer.update()
def pts():
 m=b.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh();v=[(b.matrix_world@p.co).copy() for p in m.vertices];b.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear();return v
v=pts();k['body_abdominal_definition'].value=0;bpy.context.view_layer.update();w=pts()
print('ABS_CHECK',json.dumps({'matrix':[list(r) for r in b.matrix_world],'max':max((p-q).length for p,q in zip(v,w)),'weights':{x.name:x.value for x in k if 'body_' in x.name},'delta_bounds':[[min(p[i]-q[i] for p,q in zip(v,w)),max(p[i]-q[i] for p,q in zip(v,w))] for i in range(3)]}))
