"""Independent read-only checks of exported female GLBs, including body states."""
import bpy,sys,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
report=root.parent/'assets/blender/female-clothes-validation-v6-skirt3.json'
assert not report.exists(),'Refusing overwrite'
assets={}
for name,file in [('body','ONFIT_Human_Female_v2'),*[(n,'ONFIT_'+n+'_Female_'+('v6' if n in ['TShirt','LongSleeve'] else 'v5')) for n in ['TShirt','LongSleeve','Pants','Outer','HoodedJacket']],('Skirt','ONFIT_Skirt_Female_v3')]:
    bpy.ops.import_scene.gltf(filepath=str(root/f'public/models/{file}.glb'))
    meshes=[o for o in bpy.context.selected_objects if o.type=='MESH']
    assert len(meshes)==1
    assets[name]=meshes[0]
seam_positions={}
for name in ['TShirt','LongSleeve','Pants','Outer','HoodedJacket']:
    bpy.ops.import_scene.gltf(filepath=str(root/f'public/models/ONFIT_{name}_BodyBuild_v10.glb'))
    original=next(o for o in bpy.context.selected_objects if o.type=='MESH')
    seam_positions[name]=[tuple(round(v*1e6) for v in p.co) for p in original.data.shape_keys.key_blocks[0].data]
seam_positions['Skirt']=[tuple(round(v*1e6) for v in p.co) for p in assets['Skirt'].data.shape_keys.key_blocks[0].data]
defaults={name:{k.name:k.value for k in mesh.data.shape_keys.key_blocks} for name,mesh in assets.items()}
def surface(mesh):
    mesh.data.calc_loop_triangles()
    keys=mesh.data.shape_keys.key_blocks
    points=[v.co.copy() for v in keys[0].data]
    for key in list(keys)[1:]:
        if key.value:
            for i,p in enumerate(key.data):points[i]+=key.value*(p.co-keys[0].data[i].co)
    points=[mesh.matrix_world@p for p in points]
    triangles=[tuple(t.vertices) for t in mesh.data.loop_triangles]
    return points,triangles,BVHTree.FromPolygons(points,triangles,all_triangles=True)
states={'default':{},'lean':{'build_lean':1},'muscular':{'build_muscular':1},
    'abdomen_max_pelvis_min':{'abdomen_front':.8,'pelvis_width':-1},
    'shoulder_chest_max':{'shoulder_width':1,'chest_volume':1},
    'waist_min_hip_max':{'waist_width':-1,'hip_volume':1}}
rows=[]
for label,state in states.items():
    for name,mesh in assets.items():
        keys=mesh.data.shape_keys.key_blocks
        for k in keys:k.value=defaults[name][k.name]
        for key,value in state.items():
            actual=('body_'+key if key.startswith('build_') else key) if name=='body' else 'garment_'+key
            if actual in keys:keys[actual].value=value
    body_points,body_tris,body=surface(assets['body'])
    surfaces={}
    for name,mesh in assets.items():
        if name=='body':continue
        points,tris,tree=surface(mesh);surfaces[name]=tree
        gaps=[];negative=[]
        for p in points[::max(1,len(points)//3000)]:
            q,n,_,distance=body.find_nearest(p)
            if q is not None and distance<.065:
                gap=(p-q).dot(n);gaps.append(gap)
                if gap<-.005:negative.append([gap,*p])
        # glTF splits UV/normal seams into duplicated vertex indices. Exclude
        # coincident welded neighbours as well as ordinary shared-edge faces.
        welded=seam_positions[name]
        tri_positions=[{welded[i] for i in tri} for tri in tris]
        own={tuple(sorted((a,b))) for a,b in tree.overlap(tree) if a!=b and not tri_positions[a].intersection(tri_positions[b])}
        rows.append({'state':label,'garment':name,'body_triangle_intersection_pairs':len(body.overlap(tree)),
            'self_intersection_pairs':len(own),'samples':len(gaps),'inside_over_5mm':sum(v<-.005 for v in gaps),
            'min_signed_sample_m':min(gaps) if gaps else None,'worst_sample_coordinates':sorted(negative)[:3]})
    for a,b in [('TShirt','Pants'),('LongSleeve','Pants'),('HoodedJacket','Pants'),('TShirt','Outer'),('LongSleeve','Outer'),('TShirt','Skirt'),('LongSleeve','Skirt')]:
        rows.append({'state':label,'layering':a+'/'+b,'triangle_intersection_pairs':len(surfaces[a].overlap(surfaces[b]))})
report.write_text(json.dumps({'limitations':'Triangle pair counts and signed nearest surface samples are not penetration depths or physical cloth validation. No browser verification.', 'checks':rows},indent=2),encoding='utf8')
for r in rows:
    if r['state']=='default':print('FEMALE_CHECK',json.dumps(r),flush=True)
print('ONFIT_FEMALE_VALIDATION_OK',report,flush=True)
