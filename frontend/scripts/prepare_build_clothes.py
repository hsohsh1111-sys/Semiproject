"""Transfer actual body-build deltas to existing garments; preserve originals."""
import bpy,sys,json,hashlib
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
version=sys.argv[sys.argv.index('--')+2] if len(sys.argv)>sys.argv.index('--')+2 else 'v10'
source=Path(bpy.data.filepath);source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
body=bpy.data.objects['Human'];keys=body.data.shape_keys.key_blocks
basis=np.array([p.co[:] for p in keys[0].data]);points=basis.copy()
for key in list(keys)[1:]:points+=key.value*(np.array([p.co[:] for p in key.data])-basis)
mask=next(mod for mod in body.modifiers if mod.type=='MASK');group=body.vertex_groups[mask.vertex_group]
keep=np.array([any(g.group==group.index and g.weight>mask.threshold for g in v.groups) for v in body.data.vertices])
ids=np.flatnonzero(keep)
relief=np.zeros_like(basis)
for name in ['body_chest_relief','body_abdomen_relief']:
    if name in keys:relief+=keys[name].value*(np.array([p.co[:] for p in keys[name].data])-basis)
tree=KDTree(len(ids))
for i in ids:tree.insert(body.matrix_world@Vector(points[i]-relief[i]),int(i))
tree.balance()
delta={'relief':relief,**{name:np.array([p.co[:] for p in keys['body_build_'+name].data])-basis for name in ['lean','muscular']}}
for obj in list(bpy.context.scene.objects):obj.hide_render=True;obj.hide_set(True)
sources=['ONFIT_TShirt_BodyMorph_v5','ONFIT_LongSleeve_BodyMorph_v1','ONFIT_Pants_BodyMorph_v2','ONFIT_Outer_BodyMorph_v1','ONFIT_HoodedJacket_BodyMorph_v1']
reports=[]
for source_name in sources:
    stem=source_name.split('_BodyMorph_')[0]+'_BodyBuild_'+version
    glb=root/'public/models'/f'{stem}.glb';blend=root.parent/'assets/blender'/f'{stem}.blend'
    assert not glb.exists() and not blend.exists(),'Refusing overwrite'
    asset=root/'public/models'/f'{source_name}.glb';asset_hash=hashlib.sha256(asset.read_bytes()).hexdigest()
    bpy.ops.import_scene.gltf(filepath=str(asset))
    objects=list(bpy.context.selected_objects)
    meshes=[o for o in objects if o.type=='MESH']
    checks=[]
    for mesh in meshes:
        if not mesh.data.shape_keys:mesh.shape_key_add(name='Basis')
        base=mesh.data.shape_keys.key_blocks[0]
        coords=np.array([p.co[:] for p in base.data])
        old_keys={k.name:(k.value,np.array([p.co[:] for p in k.data])) for k in mesh.data.shape_keys.key_blocks}
        uv=[np.array([loop.uv[:] for loop in layer.data]) for layer in mesh.data.uv_layers]
        neighbors=[tree.find_n(mesh.matrix_world@Vector(point),12) for point in coords]
        mesh.data.calc_loop_triangles();tris=np.array([tuple(t.vertices) for t in mesh.data.loop_triangles])
        def normals(c):
            t=c[tris];return np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0])
        before=normals(coords)
        default_reference=coords.copy()
        adjacent=[set() for _ in coords]
        for a,b,c in tris:
            adjacent[a].update([b,c]);adjacent[b].update([a,c]);adjacent[c].update([a,b])
        inv=mesh.matrix_world.to_3x3().inverted();world=body.matrix_world.to_3x3()
        for name in delta:
            transferred=[]
            for items in neighbors:
                weights=np.array([1/max(d,.002)**2 for _,_,d in items]);weights/=weights.sum()
                displacement=sum((delta[name][index]*weights[i] for i,(_,index,_) in enumerate(items)),np.zeros(3))
                transferred.append(inv@(world@Vector(displacement)))
            transferred=np.array(transferred)
            # Smooth the transferred displacement, never the authored garment
            # surface, UVs or folds. Avoid nearest-body seams at armpits.
            for _ in range(12):
                transferred=np.array([.6*transferred[i]+.4*np.mean(transferred[list(n)],axis=0) if n else transferred[i] for i,n in enumerate(adjacent)])
            if name=='relief':transferred*=.75
            for strength in [1.0,.9,.8,.7,.6,.5,.4,.3,.2,.1,0.0]:
                if not np.any(np.sum(normals(default_reference+transferred*strength)*before,axis=1)<0):break
            transferred*=strength
            key=mesh.shape_key_add(name='garment_build_'+name,from_mix=False);key.relative_key=base;key.value=1 if name=='relief' else 0
            key.data.foreach_set('co',(coords+transferred).ravel())
            flipped=int(np.sum(np.sum(normals(default_reference+transferred)*before,axis=1)<0))
            assert flipped==0,(stem,name,flipped)
            checks.append({'target':key.name,'strength':strength,'changed_vertices':int(np.sum(np.linalg.norm(transferred,axis=1)>1e-7)),'flipped_triangles':flipped})
            if name=='relief':default_reference=coords+transferred;before=normals(default_reference)
        for name,(value,c) in old_keys.items():
            key=mesh.data.shape_keys.key_blocks[name]
            assert key.value==value and np.array_equal(np.array([p.co[:] for p in key.data]),c)
        assert all(np.array_equal(a,np.array([loop.uv[:] for loop in layer.data])) for a,layer in zip(uv,mesh.data.uv_layers))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True);obj.hide_render=False;obj.hide_set(False)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=False,export_morph=True,export_morph_normal=True,export_animations=False)
    assert hashlib.sha256(asset.read_bytes()).hexdigest()==asset_hash
    reports.append({'source':asset.name,'source_sha256':asset_hash,'glb':glb.name,'checks':checks,'UV_and_original_keys_preserved':True})
    for obj in objects:obj.hide_render=True;obj.hide_set(True)
assert hashlib.sha256(source.read_bytes()).hexdigest()==source_hash
out=root.parent/f'assets/blender/body-build-clothes-{version}.json';assert not out.exists()
out.write_text(json.dumps(reports,indent=2),encoding='utf8')
print('ONFIT_BUILD_CLOTHES',json.dumps(reports))
