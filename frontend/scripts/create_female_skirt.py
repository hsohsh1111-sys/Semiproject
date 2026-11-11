"""Fit the installed CC0 female_elegantsuit01 skirt using MPFB; preserve sources."""
import argparse,sys,json,hashlib,importlib
from pathlib import Path
import bpy,addon_utils
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);parser.add_argument('--version',default='v3')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root=args.root.resolve();source=Path(bpy.data.filepath)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_hash=sha(source)
asset=Path.home()/'AppData/Roaming/Blender Foundation/Blender/5.2/extensions/.user/blender_org/mpfb/data/clothes/female_elegantsuit01/female_elegantsuit01.mhclo'
assert 'explicitly released as CC0' in asset.read_text(encoding='utf8')[:1500]
output=root/f'public/models/ONFIT_Skirt_Female_{args.version}.glb'
blend=root.parent/f'assets/blender/ONFIT_Skirt_Female_{args.version}.blend'
report=output.with_suffix('.json')
assert not any(p.exists() for p in (output,blend,report)),'Refusing overwrite'
module='bl_ext.blender_org.mpfb'
if not addon_utils.check(module)[1]:addon_utils.enable(module,default_set=True,persistent=False)
services=importlib.import_module(module+'.services')
body=bpy.data.objects['Human'];body_keys=body.data.shape_keys.key_blocks
before_values=[(k.name,k.value) for k in body_keys]
old_modifiers={m.name for m in body.modifiers};old_groups={g.name for g in body.vertex_groups}
costume=services.HumanService.add_mhclo_asset(str(asset),body,asset_type='Clothes',subdiv_levels=0,
    material_type='GAMEENGINE',set_up_rigging=False,interpolate_weights=False,import_subrig=False,import_weights=False)
# Separate connected components; retain the real skirt component below waist.
parent=list(range(len(costume.data.vertices)))
def find(i):
    while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
    return i
for edge in costume.data.edges:
    a,b=edge.vertices;parent[find(a)]=find(b)
groups={}
for i in range(len(parent)):groups.setdefault(find(i),[]).append(i)
candidates=[ids for ids in groups.values() if len(ids)>100 and max((costume.matrix_world@costume.data.vertices[i].co).z for i in ids)<1.05]
assert candidates,'No separate skirt mesh found; refusing arbitrary geometry'
skirt_ids=set(max(candidates,key=len))
print('SKIRT_COMPONENTS',[(len(ids),min(costume.data.vertices[i].co.z for i in ids),max(costume.data.vertices[i].co.z for i in ids)) for ids in groups.values() if len(ids)>100],flush=True)
bpy.ops.object.select_all(action='DESELECT');costume.select_set(True);bpy.context.view_layer.objects.active=costume
for p in costume.data.polygons:p.select=False
for e in costume.data.edges:e.select=False
for v in costume.data.vertices:v.select=v.index not in skirt_ids
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.delete(type='VERT');bpy.ops.object.mode_set(mode='OBJECT')
for m in list(body.modifiers):
    if m.name not in old_modifiers:body.modifiers.remove(m)
for g in list(body.vertex_groups):
    if g.name not in old_groups:body.vertex_groups.remove(g)
assert before_values==[(k.name,k.value) for k in body_keys]
world=costume.matrix_world.copy();costume.parent=None;costume.matrix_world=world
sub=costume.modifiers.new('Skirt surface','SUBSURF');sub.levels=sub.render_levels=1
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
costume.data=bpy.data.meshes.new_from_object(costume.evaluated_get(deps),depsgraph=deps)
for m in list(costume.modifiers):costume.modifiers.remove(m)
for p in costume.data.polygons:p.use_smooth=True
costume.name='ONFIT_Skirt_Female_'+args.version
base=np.array([v.co[:] for v in body_keys[0].data]);body_ref=base.copy()
for k in list(body_keys)[1:]:body_ref+=k.value*(np.array([v.co[:] for v in k.data])-base)
mask=next(m for m in body.modifiers if m.type=='MASK');group=body.vertex_groups[mask.vertex_group]
keep=np.array([any(g.group==group.index and g.weight>mask.threshold for g in v.groups) for v in body.data.vertices])
tree=KDTree(int(keep.sum()))
for i in np.flatnonzero(keep):tree.insert(body.matrix_world@Vector(body_ref[i]),int(i))
tree.balance();body.data.calc_loop_triangles()
bvh=BVHTree.FromPolygons([body.matrix_world@Vector(p) for p in body_ref],
    [tuple(t.vertices) for t in body.data.loop_triangles if all(keep[i] for i in t.vertices)],all_triangles=True)
coords=np.array([v.co[:] for v in costume.data.vertices]);inv=np.array(costume.matrix_world.to_3x3().inverted())
corrections=np.zeros_like(coords)
for i,p in enumerate(coords):
    wp=costume.matrix_world@Vector(p);q,n,_,distance=bvh.find_nearest(wp)
    if q is not None and distance<.05:
        gap=(wp-q).dot(n)
        desired=.003 if wp.z>.86 else .008
        if gap<desired:corrections[i]=inv@np.array(n*min(.015,desired-gap))
        elif gap>desired and wp.z>.80:
            # MPFB's original waistband was fitted over a fuller abdomen.
            # Bring only the upper skirt under the untucked shirt, keeping
            # skirt length and the lower A-line unchanged.
            t=max(0,min(1,(wp.z-.80)/.06));support=t*t*(3-2*t)
            horizontal=max(.25,n.x*n.x+n.y*n.y)
            shift=-n*min(.06,(gap-desired)/horizontal)*support;shift.z=0
            corrections[i]=inv@np.array(shift)
coords+=corrections
costume.data.vertices.foreach_set('co',coords.ravel())
costume.shape_key_add(name='Basis')
near=[tree.find_n(costume.matrix_world@Vector(p),12) for p in coords]
indices=np.array([[i for _,i,_ in n] for n in near]);weights=np.array([[1/max(d,.003)**2 for _,_,d in n] for n in near]);weights/=weights.sum(axis=1)[:,None]
edges=np.array([tuple(e.vertices) for e in costume.data.edges]);degree=np.bincount(edges.ravel(),minlength=len(coords))
target_names=[]
for name in ['waist_width','pelvis_width','hip_volume','abdomen_front','body_build_lean','body_build_muscular']:
    delta=np.array([v.co[:] for v in body_keys[name].data])-base
    delta=delta@np.array(body.matrix_world.to_3x3()).T
    field=np.einsum('nk,nkj->nj',weights,delta[indices])@inv.T
    for _ in range(6):
        sums=np.zeros_like(field);np.add.at(sums,edges[:,0],field[edges[:,1]]);np.add.at(sums,edges[:,1],field[edges[:,0]])
        field=.75*field+.25*sums/np.maximum(degree,1)[:,None]
    target='garment_'+name.replace('body_build_','build_')
    key=costume.shape_key_add(name=target,from_mix=False);key.slider_min=-1 if 'build_' not in name and name!='abdomen_front' else 0;key.value=0
    key.data.foreach_set('co',(coords+field).ravel());target_names.append(target)
for obj in bpy.context.scene.objects:obj.hide_render=obj!=body and obj!=costume
bpy.ops.object.select_all(action='DESELECT');costume.select_set(True);bpy.context.view_layer.objects.active=costume
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_apply=False,export_morph=True,export_morph_normal=True,export_animations=False)
assert sha(source)==source_hash
report.write_text(json.dumps({'source':str(source),'source_sha256':source_hash,'asset':str(asset),'asset_sha256':sha(asset),
    'license':'CC0','asset_name':'female_elegantsuit01 (skirt component)',
    'source_url':'https://www.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html',
    'vertices':len(coords),'targets':target_names,'correction_max_m':float(np.linalg.norm(corrections,axis=1).max()),
    'limitations':'Rules-based transfer, not cloth physics or calibrated sizing. Browser and extreme-body fit need validation.'},indent=2),encoding='utf8')
print('ONFIT_SKIRT_EXPORTED',output,flush=True)
