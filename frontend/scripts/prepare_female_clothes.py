"""Refit existing clothes to the real female MPFB reference, preserving sources.
Blender --background --factory-startup FEMALE.blend --python this.py -- FRONTEND
Displacement transfer in shared Blender coordinates; not cloth simulation.
"""
import bpy, sys, json, hashlib
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

root = Path(sys.argv[sys.argv.index('--')+1]).resolve()
version = sys.argv[sys.argv.index('--version')+1] if '--version' in sys.argv else 'v1'
only = sys.argv[sys.argv.index('--only')+1] if '--only' in sys.argv else None
source = Path(bpy.data.filepath)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
source_hash = sha(source)
female = bpy.data.objects['Human']
male_path = root.parent/'assets/blender/ONFIT_Human_BodyBuild_v11.blend'
male_hash = sha(male_path)
with bpy.data.libraries.load(str(male_path), link=False) as (a,b):
    b.objects = ['Human']
male = b.objects[0]
bpy.context.scene.collection.objects.link(male)
def coordinates(obj):
    keys = obj.data.shape_keys.key_blocks
    basis = np.array([v.co[:] for v in keys[0].data])
    result = basis.copy()
    for k in list(keys)[1:]:
        result += k.value*(np.array([v.co[:] for v in k.data])-basis)
    return basis, result
male_base, male_ref = coordinates(male)
female_base, female_ref = coordinates(female)
assert np.array_equal(male_base, female_base)
mask = next(m for m in female.modifiers if m.type=='MASK')
group = female.vertex_groups[mask.vertex_group]
keep = np.array([any(g.group==group.index and g.weight>mask.threshold for g in v.groups) for v in female.data.vertices])
ids = np.flatnonzero(keep)
male_world = np.array([male.matrix_world@Vector(p) for p in male_ref])
female_world = np.array([female.matrix_world@Vector(p) for p in female_ref])
tree = KDTree(len(ids))
for i in ids: tree.insert(Vector(male_world[i]), int(i))
tree.balance()
female.data.calc_loop_triangles()
body_tris = [tuple(t.vertices) for t in female.data.loop_triangles if all(keep[i] for i in t.vertices)]
body_bvh = BVHTree.FromPolygons([Vector(p) for p in female_world], body_tris, all_triangles=True)
for obj in bpy.context.scene.objects: obj.hide_render=True; obj.hide_set(True)

sources = [('TShirt',.008),('LongSleeve',.008),('Pants',.010),('Outer',.025),('HoodedJacket',.012)]
reports=[]
for name,clearance in sources:
    if only and name not in only.split(','): continue
    asset=root/f'public/models/ONFIT_{name}_BodyBuild_v10.glb'
    output=root/f'public/models/ONFIT_{name}_Female_{version}.glb'
    blend=root.parent/f'assets/blender/ONFIT_{name}_Female_{version}.blend'
    assert not output.exists() and not blend.exists(), 'Refusing overwrite'
    asset_hash=sha(asset)
    bpy.ops.import_scene.gltf(filepath=str(asset))
    objects=list(bpy.context.selected_objects)
    meshes=[o for o in objects if o.type=='MESH']
    checks=[]
    for mesh in meshes:
        keys=mesh.data.shape_keys.key_blocks
        coords=np.array([p.co[:] for p in keys[0].data])
        original={k.name:(k.value,np.array([v.co[:] for v in k.data])) for k in keys}
        uv=[np.array([v.uv[:] for v in layer.data]) for layer in mesh.data.uv_layers]
        matrix=np.array(mesh.matrix_world.to_3x3())
        inv=np.linalg.inv(matrix)
        world=np.array([mesh.matrix_world@Vector(p) for p in coords])
        near=[tree.find_n(Vector(p),12) for p in world]
        indices=np.array([[i for _,i,_ in n] for n in near])
        weights=np.array([[1/max(d,.003)**2 for _,_,d in n] for n in near])
        weights/=weights.sum(axis=1)[:,None]
        edges=np.array([tuple(e.vertices) for e in mesh.data.edges])
        degree=np.bincount(edges.ravel(),minlength=len(coords))
        # glTF UV seams may split one physical point into multiple indices.
        # Average their displacement together to avoid opening new cracks.
        _,seam_groups=np.unique(np.round(coords,6),axis=0,return_inverse=True)
        seam_counts=np.bincount(seam_groups)
        def match_seams(delta):
            values=np.zeros((len(seam_counts),3))
            np.add.at(values,seam_groups,delta)
            return (values/seam_counts[:,None])[seam_groups]
        def smooth(delta,iterations=6):
            delta=match_seams(delta)
            for _ in range(iterations):
                summed=np.zeros_like(delta)
                np.add.at(summed,edges[:,0],delta[edges[:,1]])
                np.add.at(summed,edges[:,1],delta[edges[:,0]])
                delta=match_seams(.75*delta+.25*summed/np.maximum(degree,1)[:,None])
            return delta
        def transfer(field):
            return smooth(np.einsum('nk,nkj->nj',weights,field[indices])@inv.T)
        gender=transfer(female_world-male_world)
        for k in keys: k.data.foreach_set('co',(original[k.name][1]+gender).ravel())
        # Replace only the build deltas with female-specific body targets.
        for build in ['lean','muscular']:
            body_delta=np.array([p.co[:] for p in female.data.shape_keys.key_blocks['body_build_'+build].data])-female_base
            field=body_delta@np.array(female.matrix_world.to_3x3()).T
            delta=transfer(field)
            key=keys['garment_build_'+build]
            key.data.foreach_set('co',(coords+gender+delta).ravel())
        # Local clearance correction, capped at 12mm; never enlarge all clothes.
        default=coords+gender
        for k in list(keys)[1:]:
            default+=k.value*(np.array([p.co[:] for p in k.data])-(coords+gender))
        abdomen_trim=np.zeros_like(coords)
        if name in ['TShirt','LongSleeve'] and version=='v6':
            # The inherited male shirt drape has excess front depth below the
            # bust. Fit only this default front panel toward a 20mm body gap;
            # preserve bust, back, sleeves and original abdomen morph deltas.
            def ease(a,b,x):
                t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
            for i,p in enumerate(default):
                wp=mesh.matrix_world@Vector(p)
                support=ease(.80,.90,wp.z)*(1-ease(1.04,1.13,wp.z))*(1-ease(.13,.23,abs(wp.x)))
                if support<=0 or wp.y>-.015:continue
                hit,_,_,_=body_bvh.ray_cast(Vector((wp.x,-.6,wp.z)),Vector((0,1,0)),1.2)
                if hit is not None:
                    inward=max(0,min(.030,hit.y-.020-wp.y))*support
                    abdomen_trim[i]=inv@np.array((0,inward,0))
            abdomen_trim=smooth(abdomen_trim,8)
            for k in keys:k.data.foreach_set('co',(np.array([v.co[:] for v in k.data])+abdomen_trim).ravel())
            default+=abdomen_trim
        corrections=np.zeros_like(coords)
        signed_before=[]
        for i,p in enumerate(default):
            wp=mesh.matrix_world@Vector(p)
            q,n,_,distance=body_bvh.find_nearest(wp)
            if q is None or distance>.065: continue
            gap=(wp-q).dot(n)
            signed_before.append(gap)
            if gap<clearance:
                limit=.055 if name=='HoodedJacket' and wp.z>1.24 and abs(wp.x)<.12 else .012
                corrections[i]=inv@np.array(n*min(limit,clearance-gap))
        corrections=smooth(corrections,8)
        for k in keys:
            arr=np.array([v.co[:] for v in k.data])+corrections
            assert np.isfinite(arr).all()
            k.data.foreach_set('co',arr.ravel())
        if name=='HoodedJacket':
            # The authored folded collar penetrates the neck in the source.
            # Project only this small collar region outwards in short smooth
            # steps, keeping hood, sleeves and the rest of the body untouched.
            for _ in range(3):
                current_base=np.array([v.co[:] for v in keys[0].data])
                current=current_base.copy()
                for key in list(keys)[1:]:current+=key.value*(np.array([v.co[:] for v in key.data])-current_base)
                patch=np.zeros_like(coords)
                for i,p in enumerate(current):
                    wp=mesh.matrix_world@Vector(p)
                    if not (1.22<wp.z<1.43 and abs(wp.x)<.13):continue
                    q,n,_,distance=body_bvh.find_nearest(wp)
                    if q is not None and distance<.065:
                        gap=(wp-q).dot(n)
                        if gap<.004:patch[i]=inv@np.array(n*min(.025,.004-gap))
                patch=smooth(patch,4)
                for key in keys:key.data.foreach_set('co',(np.array([v.co[:] for v in key.data])+patch).ravel())
                corrections+=patch
        assert all(np.array_equal(u,np.array([v.uv[:] for v in layer.data])) for u,layer in zip(uv,mesh.data.uv_layers))
        assert all(k.value==original[k.name][0] for k in keys)
        mesh.data.calc_loop_triangles()
        tris=np.array([tuple(t.vertices) for t in mesh.data.loop_triangles])
        def normals(c):
            t=c[tris];return np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0])
        base=np.array([v.co[:] for v in keys[0].data])
        ref=base.copy()
        for k in list(keys)[1:]:ref+=k.value*(np.array([v.co[:] for v in k.data])-base)
        def gaps(c):
            values=[]
            for p in c[::max(1,len(c)//3000)]:
                wp=mesh.matrix_world@Vector(p)
                q,n,_,distance=body_bvh.find_nearest(wp)
                if q is not None and distance<.065:values.append((wp-q).dot(n))
            return {'samples':len(values),'inside_over_5mm':sum(v<-.005 for v in values),'min_signed_sample_m':min(values) if values else None}
        # Numeric evidence, not proof of collision-free cloth or visual quality.
        states={'default':{},'abdomen_max_pelvis_min':{'garment_abdomen_front':.8,'garment_pelvis_width':-1},
            'lean':{'garment_build_lean':1},'muscular':{'garment_build_muscular':1}}
        state_checks={}
        for label,state in states.items():
            c=ref.copy()
            for key,value in state.items():
                if key in keys:c+=(value-keys[key].value)*(np.array([v.co[:] for v in keys[key].data])-base)
            state_checks[label]={'normal_reversals_vs_default':int(np.sum(np.sum(normals(c)*normals(ref),axis=1)<0))}
        checks.append({'mesh':mesh.name,'vertices':len(coords),'gender_delta_max_m':float(np.linalg.norm(gender,axis=1).max()),
            'abdomen_trim_max_m':float(np.linalg.norm(abdomen_trim,axis=1).max()),
            'correction_max_m':float(np.linalg.norm(corrections,axis=1).max()),'female_default_gap_before_correction':gaps(default),
            'female_default_gap_after_correction':gaps(ref),'states':state_checks,'UV_preserved':True,'target_names':[k.name for k in list(keys)[1:]]})
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True);obj.hide_render=False;obj.hide_set(False)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_apply=False,export_morph=True,export_morph_normal=True,export_animations=False)
    assert sha(asset)==asset_hash
    reports.append({'source':asset.name,'source_sha256':asset_hash,'output':output.name,'checks':checks})
    for obj in objects:obj.hide_render=True;obj.hide_set(True)
assert sha(source)==source_hash and sha(male_path)==male_hash
report=root.parent/f'assets/blender/female-clothes-{only+"-" if only else ""}{version}.json'
assert not report.exists()
report.write_text(json.dumps(reports,indent=2),encoding='utf8')
print('ONFIT_FEMALE_CLOTHES_OK',report,flush=True)
