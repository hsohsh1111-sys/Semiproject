"""Small, local displacement-field refinement; source geometry/UVs stay intact.
Blender --factory-startup --background --python this.py -- FRONTEND [--render]
"""
import bpy
import hashlib
import itertools
import json
import struct
import sys
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
models=root/'public/models';assets=root.parent/'assets/blender'
report_path=assets/'garment_quality_v5_v2.json'
rendering='--render' in sys.argv
authoring_only='--authoring-only' in sys.argv
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sources={'body':models/'ONFIT_Human_BodyMorph_v3.glb','top':models/'ONFIT_TShirt_BodyMorph_v4.glb','bottom':models/'ONFIT_Pants_BodyMorph_v1.glb'}
outputs={'top':models/'ONFIT_TShirt_BodyMorph_v5.glb','bottom':models/'ONFIT_Pants_BodyMorph_v2.glb'}
blends={'top':assets/'ONFIT_TShirt_BodyMorph_v5.blend','bottom':assets/'ONFIT_Pants_BodyMorph_v2.blend'}
if not rendering and not authoring_only:assert not any(p.exists() for p in [report_path,*outputs.values(),*blends.values()]),'Refusing overwrite'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete()
def load(path):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path))
    obj=next(o for o in set(bpy.data.objects)-before if o.type=='MESH')
    obj.data.calc_loop_triangles()
    return obj
if authoring_only:
    # Re-import the exported assets, including their custom smooth normals, so
    # authoring files show exactly the same new outfit as the comparison render.
    assert not any(p.exists() for p in blends.values()),'Refusing overwrite'
    load(sources['body'])
    for path in outputs.values():
        obj=load(path)
        for key in obj.data.shape_keys.key_blocks:
            if key.name.startswith('garment_'):key.slider_min=0 if 'abdomen' in key.name else -1
    for path in blends.values():bpy.ops.wm.save_as_mainfile(filepath=str(path))
    print('ONFIT_AUTHORING_NORMALS_MATCH_EXPORTED_GLB')
    sys.exit(0)
def data(obj):
    keys=obj.data.shape_keys.key_blocks
    base=np.array([v.co[:] for v in keys[0].data])
    deltas={k.name:np.array([v.co[:] for v in k.data])-base for k in list(keys)[1:]}
    defaults={k.name:k.value for k in list(keys)[1:]}
    return {'obj':obj,'base':base,'delta':deltas,'defaults':defaults,
            'tri':np.array([t.vertices[:] for t in obj.data.loop_triangles])}
items={slot:data(load(path)) for slot,path in sources.items()}
def welded(base,tri):
    _,inverse=np.unique(np.round(base,6),axis=0,return_inverse=True)
    count=int(inverse.max())+1;counts=np.bincount(inverse,minlength=count)
    edges=np.concatenate([tri[:,[0,1]],tri[:,[1,2]],tri[:,[2,0]]])
    edges=inverse[edges];edges=np.unique(np.sort(edges,axis=1),axis=0)
    edges=edges[edges[:,0]!=edges[:,1]]
    directed=np.concatenate([edges,edges[:,::-1]])
    degrees=np.bincount(directed[:,0],minlength=count)
    return inverse,counts,directed,degrees
def average(values,inverse,counts):
    result=np.zeros((len(counts),3));np.add.at(result,inverse,values)
    return result/counts[:,None]
def neighbor_average(values,edges,degrees):
    result=np.zeros_like(values);np.add.at(result,edges[:,0],values[edges[:,1]])
    return result/np.maximum(degrees,1)[:,None]
def face_normals(points,tri):return np.cross(points[tri[:,1]]-points[tri[:,0]],points[tri[:,2]]-points[tri[:,0]])
def smooth_normals(points,tri,inverse):
    # Weld only coincident UV-split vertices while accumulating area-weighted
    # normals. Geometry, UV seams, cloth folds and authored wrinkles are intact.
    n=np.zeros((int(inverse.max())+1,3));f=face_normals(points,tri)
    for axis in range(3):np.add.at(n,inverse[tri[:,axis]],f)
    n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-12)
    return n[inverse]
def seam_error(normals,inverse,counts):
    mean=average(normals,inverse,counts);mean/=np.maximum(np.linalg.norm(mean,axis=1)[:,None],1e-12)
    angles=np.degrees(np.arccos(np.clip(np.sum(normals*mean[inverse],axis=1),-1,1)))
    duplicated=counts[inverse]>1
    return {'max_degrees':float(angles[duplicated].max(initial=0)),
            'vertices_over_5_degrees':int(np.sum((angles>5)&duplicated))}
analysis={}
for slot in ['top','bottom']:
    item=items[slot];base=item['base'];tri=item['tri']
    inverse,counts,edges,degrees=welded(base,tri)
    item['weld']=inverse;item['faces']=[set(t) for t in inverse[tri]]
    item['old_delta']={n:d.copy() for n,d in item['delta'].items()}
    normal=np.array([v.normal[:] for v in item['obj'].data.vertices])
    # Imported glTF per-loop normals, rather than Blender's regenerated normals.
    raw=sources[slot].read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
    primitive=doc['meshes'][0]['primitives'][0]
    a=doc['accessors'][primitive['attributes']['NORMAL']];v=doc['bufferViews'][a['bufferView']]
    offset=a.get('byteOffset',0)+v.get('byteOffset',0)
    gn=np.array([struct.unpack_from('<3f',binary,offset+i*v.get('byteStride',12)) for i in range(a['count'])])
    normal=np.column_stack([gn[:,0],-gn[:,2],gn[:,1]])
    # Open neckline/cuffs/hem and their adjacent ring are constrained. A field
    # smoothing pass must not disturb already-nearby cloth boundary surfaces.
    welded_tri=inverse[tri]
    undirected=np.sort(np.concatenate([welded_tri[:,[0,1]],welded_tri[:,[1,2]],welded_tri[:,[2,0]]]),axis=1)
    unique_edges,edge_counts=np.unique(undirected,axis=0,return_counts=True)
    frozen=np.zeros(len(counts),dtype=bool)
    frozen[unique_edges[edge_counts==1].ravel()]=True
    frozen[edges[frozen[edges[:,0]],1]]=True
    stats={}
    for name,delta in item['delta'].items():
        values=average(delta,inverse,counts);before=values.copy()
        initial=neighbor_average(values,edges,degrees)-values
        for _ in range(2):values+=.20*(neighbor_average(values,edges,degrees)-values)
        correction=values-before
        # Correct at most 0.45mm, not the whole mesh. Unchanged far-away neck,
        # sleeve cuffs, knees and hem vertices are never moved by a field pass.
        length=np.linalg.norm(correction,axis=1)
        correction*=np.minimum(1,.00045/np.maximum(length,1e-12))[:,None]
        correction[frozen]=0
        delta=delta+correction[inverse]
        final=average(delta,inverse,counts)
        after=neighbor_average(final,edges,degrees)-final
        item['delta'][name]=delta
        stats[name]={'max_correction_m':float(np.linalg.norm(correction,axis=1).max()),
                     'laplacian_rms_before':float(np.sqrt(np.mean(initial**2))),
                     'laplacian_rms_after':float(np.sqrt(np.mean(after**2))),
                     'max_delta_before_m':float(np.linalg.norm(item['old_delta'][name],axis=1).max()),
                     'max_delta_after_m':float(np.linalg.norm(delta,axis=1).max())}
    analysis[slot]={'vertices':len(base),'unique_positions':len(counts),'morphs':stats,
                    'normal_seams_before':seam_error(normal,inverse,counts),
                    'normal_seams_after':seam_error(smooth_normals(base,tri,inverse),inverse,counts)}
print('QUALITY_ANALYSIS',json.dumps(analysis),flush=True)

def tree(points,tri):return BVHTree.FromPolygons([Vector(p) for p in points],tri.tolist(),all_triangles=True)
def points(item,weights,old=False):
    p=item['base'].copy()
    for n,d in (item.get('old_delta',item['delta']) if old else item['delta']).items():
        p+=weights.get(n.removeprefix('garment_'),item['defaults'][n])*d
    return p
states=[('base',{}),('abdomen_max_pelvis_min',{'abdomen_front':.8,'pelvis_width':-1}),
        ('shoulder_max_chest_max',{'shoulder_width':1,'chest_volume':1}),
        ('waist_min_hip_max',{'waist_width':-1,'hip_volume':1}),
        ('pelvis_max_thigh_max',{'pelvis_width':1,'thigh_girth':1}),('restored',{})]
states += [('lower_corner_'+str(i),dict(zip(['waist_width','pelvis_width','hip_volume','thigh_girth'],v)))
           for i,v in enumerate(itertools.product([-1,1],repeat=4))]
states += [(n+('_minus' if sign<0 else '_plus'),{n:sign}) for n in ['shoulder_width','chest_volume','waist_width','pelvis_width','hip_volume','thigh_girth'] for sign in [-1,1]]

def validate():
    checks=[]
    for label,w in states:
        skin=points(items['body'],w);bvh=tree(skin,items['body']['tri'])
        for version,old in [('before',True),('after',False)]:
            p={slot:points(items[slot],w,old) for slot in ['top','bottom']}
            surfaces={slot:tree(p[slot],items[slot]['tri']) for slot in p}
            check={'state':label,'version':version,'weights':w,'top_bottom_overlap_pairs':len(surfaces['top'].overlap(surfaces['bottom']))}
            for slot in p:
                item=items[slot];tri=item['tri'];coords=p[slot]
                f=face_normals(coords,tri);initial=face_normals(item['base'],tri)
                valid=np.linalg.norm(initial,axis=1)>1e-12
                crossings=sum(i<j and not item['faces'][i]&item['faces'][j] for i,j in surfaces[slot].overlap(surfaces[slot]))
                gaps=[]
                for point in coords:
                    q,n,_,_=bvh.find_nearest(Vector(point));gaps.append((Vector(point)-q).dot(n))
                check[slot]={'body_overlap_pairs':len(bvh.overlap(surfaces[slot])),
                             'self_overlap_pairs':crossings,'flipped_triangles':int(np.sum(np.sum(f[valid]*initial[valid],axis=1)<=0)),
                             'min_gap_m':min(gaps),'inside_over_2mm':sum(g<-.002 for g in gaps)}
            checks.append(check)
    return checks

def write_glb(slot):
    item=items[slot];raw=sources[slot].read_bytes();n=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+n]);size=struct.unpack_from('<I',raw,20+n)[0];binary=bytearray(raw[28+n:28+n+size])
    primitive=doc['meshes'][0]['primitives'][0]
    def accessor(values):
        values=np.column_stack([values[:,0],values[:,2],-values[:,1]]).astype('<f4')
        while len(binary)%4:binary.append(0)
        offset=len(binary);binary.extend(values.tobytes())
        doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':values.nbytes})
        doc['accessors'].append({'bufferView':len(doc['bufferViews'])-1,'componentType':5126,'count':len(values),'type':'VEC3',
                                'min':values.min(axis=0).tolist(),'max':values.max(axis=0).tolist()})
        return len(doc['accessors'])-1
    base_normals=smooth_normals(item['base'],item['tri'],item['weld'])
    primitive['attributes']['NORMAL']=accessor(base_normals)
    for i,name in enumerate(doc['meshes'][0]['extras']['targetNames']):
        delta=item['delta'][name]
        primitive['targets'][i]={'POSITION':accessor(delta),'NORMAL':accessor(smooth_normals(item['base']+delta,item['tri'],item['weld'])-base_normals)}
    doc['buffers'][0]['byteLength']=len(binary)
    j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*(-len(j)%4);binary+=b'\0'*(-len(binary)%4)
    outputs[slot].write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary)
    keys=item['obj'].data.shape_keys.key_blocks
    for name,d in item['delta'].items():
        key=keys[name];key.slider_min=0 if 'abdomen' in name else -1
        for i,v in enumerate(key.data):v.co=item['base'][i]+d[i]
    for polygon in item['obj'].data.polygons:polygon.use_smooth=True
    item['obj'].data.normals_split_custom_set_from_vertices(base_normals.tolist())
    # Each BLEND stores the complete aligned reference outfit. The GLB contains
    # only its own garment, with original binary UV/material/texture data.
    bpy.ops.wm.save_as_mainfile(filepath=str(blends[slot]))

if not rendering:
    hashes={str(p):sha(p) for p in sources.values()}
    checks=validate()
    # Never publish a numerically worse collision or fold candidate silently.
    for old,new in zip(checks[::2],checks[1::2]):
        assert new['top_bottom_overlap_pairs']<=old['top_bottom_overlap_pairs'],(new['state'],'layering',old,new)
        for slot in ['top','bottom']:
            for metric in ['body_overlap_pairs','self_overlap_pairs','flipped_triangles']:
                assert new[slot][metric]<=old[slot][metric],(new['state'],slot,metric,old[slot],new[slot])
    for slot in ['top','bottom']:write_glb(slot)
    assert all(sha(Path(p))==h for p,h in hashes.items())
    report={'source_hashes':hashes,'output_hashes':{slot:sha(p) for slot,p in outputs.items()},'analysis':analysis,'checks':checks,
            'base_positions_unchanged':True,'uv_material_texture_bytes_preserved':True,'visual_review':False,'browser_verified':False,
            'method':'Two local 20% Laplacian passes of morph displacement only, capped at 0.45mm. Welded area-weighted smooth normals across UV splits.'}
    report_path.write_text(json.dumps(report,indent=2),encoding='utf8')
    print('ONFIT_QUALITY',json.dumps(analysis))
else:
    # Re-import original and new actual GLBs so render comparisons exercise the
    # exported normal/morph accessors, not regenerated authoring normals.
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete()
    body=load(sources['body'])
    outfits={label:{slot:load(path) for slot,path in paths.items()} for label,paths in
             [('before',{slot:sources[slot] for slot in ['top','bottom']}),('after',outputs)]}
    all_objects=[body]+[o for outfit in outfits.values() for o in outfit.values()]
    defaults={o:{k.name:k.value for k in o.data.shape_keys.key_blocks} for o in all_objects}
    for obj in all_objects:
        for k in obj.data.shape_keys.key_blocks:
            if k.name.startswith('garment_') or k.name in ['shoulder_width','chest_volume','waist_width','pelvis_width','hip_volume','thigh_girth']:k.slider_min=-1
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12;scene.cycles.use_denoising=True
    scene.render.resolution_x=360;scene.render.resolution_y=540;scene.render.resolution_percentage=100
    scene.world.color=(.3,.3,.3)
    def aim(o):o.rotation_euler=(Vector((0,0,.85))-o.location).to_track_quat('-Z','Y').to_euler()
    for loc in [(2,-3,3),(-2,3,3),(-3,-1,2)]:
        d=bpy.data.lights.new('Softbox','AREA');d.energy=250;d.size=3
        o=bpy.data.objects.new('Softbox',d);scene.collection.objects.link(o);o.location=loc;aim(o)
    d=bpy.data.cameras.new('ComparisonCamera');d.type='ORTHO';d.ortho_scale=1.9
    cam=bpy.data.objects.new('ComparisonCamera',d);scene.collection.objects.link(cam);scene.camera=cam
    out=assets/'previews/garment_quality_v5_v2';out.mkdir(parents=True,exist_ok=True)
    for label,w in states[:6]:
        for obj in all_objects:
            for k in obj.data.shape_keys.key_blocks:
                k.value=w.get(k.name.removeprefix('garment_'),defaults[obj][k.name])
        for version,outfit in outfits.items():
            for key,other in outfits.items():
                for obj in other.values():obj.hide_render=key!=version
            for view,loc in [('front',(0,-3,.85)),('side',(3,0,.85)),('back',(0,3,.85))]:
                path=out/f'{label}_{view}_{version}.png';assert not path.exists()
                cam.location=loc;aim(cam);scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    print('ONFIT_QUALITY_RENDERS',36)
