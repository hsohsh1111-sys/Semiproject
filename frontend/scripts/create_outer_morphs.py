"""Author five signed jacket or long-sleeve morphs from the reference outfit.
Blender --factory-startup --background --python this.py -- FRONTEND [--render]
Add --long-sleeve for ONFIT_LongSleeve_BodyMorph_v1.
Add --hooded-jacket for ONFIT_HoodedJacket_BodyMorph_v1.
Uses existing GLBs only; never edits source assets or runtime body formulas.
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
from mathutils.geometry import barycentric_transform
from mathutils.kdtree import KDTree

root=Path(sys.argv[sys.argv.index('--')+1]).resolve();models=root/'public/models';assets=root.parent/'assets/blender'
hooded_jacket='--hooded-jacket' in sys.argv
long_sleeve='--long-sleeve' in sys.argv or hooded_jacket
asset_stem='ONFIT_HoodedJacket_BodyMorph_v1' if hooded_jacket else 'ONFIT_LongSleeve_BodyMorph_v1' if long_sleeve else 'ONFIT_Outer_BodyMorph_v1'
output=models/(asset_stem+'.glb');blend=assets/(asset_stem+'.blend')
report_path=output.with_suffix('.json');rendering='--render' in sys.argv
assert rendering or not any(p.exists() for p in [output,blend,report_path]),'Refusing overwrite'
sources={'body':models/'ONFIT_Human_BodyMorph_v3.glb','top':models/'ONFIT_TShirt_BodyMorph_v5.glb',
         'bottom':models/'ONFIT_Pants_BodyMorph_v2.glb','outer':models/'ONFIT_Outer_v1.glb'}
if long_sleeve:
    sources['outer']=models/'ONFIT_Outer_BodyMorph_v1.glb'
    sources['long']=models/('ONFIT_HoodedJacket_v1.glb' if hooded_jacket else 'ONFIT_LongSleeve_v1.glb')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
hashes={str(p):sha(p) for p in sources.values()}
names=['shoulder_width','chest_volume','waist_width','abdomen_front','pelvis_width']
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete()
def load(path):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path))
    obj=next(o for o in set(bpy.data.objects)-before if o.type=='MESH');obj.data.calc_loop_triangles()
    keys=obj.data.shape_keys.key_blocks if obj.data.shape_keys else []
    basis=np.array([v.co[:] for v in (keys[0].data if keys else obj.data.vertices)])
    delta={k.name:np.array([v.co[:] for v in k.data])-basis for k in list(keys)[1:]}
    defaults={k.name:k.value for k in list(keys)[1:]}
    return {'obj':obj,'base':basis,'delta':delta,'defaults':defaults,'tri':np.array([t.vertices[:] for t in obj.data.loop_triangles])}
items={slot:load(path) for slot,path in sources.items()}
def points(item,weights):
    p=item['base'].copy()
    for n,d in item['delta'].items():p+=weights.get(n.removeprefix('garment_'),item['defaults'][n])*d
    return p
def tree(p,t):return BVHTree.FromPolygons([Vector(v) for v in p],t.tolist(),all_triangles=True)
def smooth(a,b,v):
    t=np.clip((v-a)/(b-a),0,1);return t*t*(3-2*t)
target_slot='long' if long_sleeve else 'outer'
outer=items[target_slot];base=outer['base'];source_base=base.copy();tri=outer['tri'];x,y,z=base.T
if long_sleeve:
    items['top']['obj'].hide_render=True
    items['top']['obj'].hide_set(True)
# A small front-facing ease reserve lets the folded placket move coherently
# without the inner tee poking through its stiff chest/abdomen transition.
front_ease=(0 if long_sleeve else .006)*(1-smooth(.065,.14,np.abs(x)))*(1-smooth(-.12,-.055,y))*smooth(.81,.88,z)*(1-smooth(1.28,1.37,z))
base[:,1]-=front_ease
skin=points(items['body'],{});shirt=points(items['top'],{})
skin_tree=tree(skin,items['body']['tri']);shirt_tree=tree(shirt,items['top']['tri'])
if long_sleeve:
    coat=points(items['outer'],{});coat_tree=tree(coat,items['outer']['tri'])
deltas={n:np.zeros_like(base) for n in names}
for i,p in enumerate(base):
    q,_,face,_=skin_tree.find_nearest(Vector(p));ids=items['body']['tri'][face]
    deltas['shoulder_width'][i]=barycentric_transform(q,*(Vector(skin[j]) for j in ids),*(Vector(items['body']['delta']['shoulder_width'][j]) for j in ids))
    if long_sleeve:
        for name in ['chest_volume','waist_width','pelvis_width']:
            deltas[name][i]=barycentric_transform(q,*(Vector(skin[j]) for j in ids),*(Vector(items['body']['delta'][name][j]) for j in ids))
    q,_,face,_=shirt_tree.find_nearest(Vector(p));ids=items['top']['tri'][face]
    for name,strength in [('chest_volume',1.02),('waist_width',.95),('pelvis_width',1.0)]:
        if long_sleeve:continue
        delta=items['top']['delta']['garment_'+name]
        deltas[name][i]=strength*np.array(barycentric_transform(q,*(Vector(shirt[j]) for j in ids),*(Vector(delta[j]) for j in ids)))
    if long_sleeve and not hooded_jacket:
        q,_,face,_=coat_tree.find_nearest(Vector(p));ids=items['outer']['tri'][face]
        coat_delta=items['outer']['delta']['garment_pelvis_width']
        transferred=np.array(barycentric_transform(q,*(Vector(coat[j]) for j in ids),*(Vector(coat_delta[j]) for j in ids)))
        blend_weight=.6*smooth(.89,.94,p[2])*(1-smooth(.23,.30,abs(p[0])))
        deltas['pelvis_width'][i]=(1-blend_weight)*deltas['pelvis_width'][i]+blend_weight*transferred
if hooded_jacket:
    # Sample the existing body fields in SPACE, rather than nearest face alone.
    # A folded garment can touch two distant body faces; nearest-face changes
    # then create a discontinuous field across an otherwise tiny garment fold.
    body_samples=KDTree(len(skin))
    for i,p in enumerate(skin):body_samples.insert(Vector(p),i)
    body_samples.balance()
    for i,p in enumerate(base):
        neighbors=body_samples.find_n(Vector(p),48)
        ids=np.array([j for _,j,_ in neighbors]);dist=np.array([d for _,_,d in neighbors])
        weights=np.exp(-(dist/.10)**2);weights/=weights.sum()
        for name in ['shoulder_width','chest_volume','waist_width','pelvis_width']:
            deltas[name][i]=np.sum(items['body']['delta'][name][ids]*weights[:,None],axis=0)
# Jacket drape is intentionally broader than the inner tee's compact field.
# Front-opening panels move together; no global scale or simulated fabric.
if long_sleeve:
    deltas['abdomen_front'][:,1]=(-.090*(1-smooth(1.075,1.30,z))*(1-smooth(.10,.28,np.abs(x)))*(1-smooth(-.075,.045,y)))
else:
    deltas['abdomen_front'][:,1]=(-.095*(1-smooth(1.075,1.32,z))*(1-smooth(.11,.30,np.abs(x)))*(1-smooth(-.075,.055,y)))
# Do not transfer torso fields to the distant long sleeves via the short tee's
# nearest cuff. Shoulder translation alone handles the full sleeve chain.
torso=1-smooth(.25,.32,np.abs(x))
for name in ['chest_volume','waist_width','pelvis_width']:deltas[name]*=torso[:,None]
deltas['chest_volume']*=smooth(1.09,1.15,z)[:,None]
deltas['waist_width']*=smooth(.96,1.02,z)[:,None]
if long_sleeve:
    # Continue a small part of the waistband width control into the shirt hem,
    # where the body's waist key is already zero but the jeans still expand.
    deltas['waist_width'][:,0]+=.0018*np.clip(x/.16,-1,1)*smooth(.85,.93,z)*(1-smooth(.97,1.03,z))*torso
if hooded_jacket:
    # Protect the actual down hood and neckline. The support fades across the
    # shoulder seam; no closing/merging of the zipper or new garment topology.
    hood_zone=(1-smooth(.15,.23,np.abs(x)))*smooth(1.28,1.36,z)
    protected=(z>1.38)&(np.abs(x)<.17)
    hood_protection=1-hood_zone
    for d in deltas.values():
        d*=hood_protection[:,None]
        d[protected]=0
    # A torso-only drape must not spread into the loose upper sleeves.
    deltas['abdomen_front']*=(1-smooth(.18,.25,np.abs(x)))[:,None]
_,inverse=np.unique(np.round(base,6),axis=0,return_inverse=True)
count=int(inverse.max())+1;counts=np.bincount(inverse,minlength=count)
edges=inverse[np.concatenate([tri[:,[0,1]],tri[:,[1,2]],tri[:,[2,0]]])]
edges=np.unique(np.sort(edges,axis=1),axis=0);edges=edges[edges[:,0]!=edges[:,1]]
edges=np.concatenate([edges,edges[:,::-1]]);degree=np.bincount(edges[:,0],minlength=count)
for name,d in deltas.items():
    if hooded_jacket:continue
    values=np.zeros((count,3));np.add.at(values,inverse,d);values/=counts[:,None]
    for _ in range(12 if hooded_jacket else 2):
        avg=np.zeros_like(values);np.add.at(avg,edges[:,0],values[edges[:,1]])
        values+=(.25 if hooded_jacket else .15)*(avg/np.maximum(degree,1)[:,None]-values)
    change=values[inverse]-d;length=np.linalg.norm(change,axis=1)
    deltas[name]=d+change*np.minimum(1,(.003 if hooded_jacket else .0004)/np.maximum(length,1e-12))[:,None]
# Bind near-touching, nonadjacent folded surfaces locally. This is a static
# displacement constraint, not sewing/remeshing or a cloth simulation.
unique=np.zeros((count,3));np.add.at(unique,inverse,base);unique/=counts[:,None]
adj=[set() for _ in range(count)]
for a,b in edges:adj[a].add(b)
kd=KDTree(count)
for i,p in enumerate(unique):kd.insert(Vector(p),i)
kd.balance();parent=list(range(count))
def find(i):
    while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
    return i
for i,p in enumerate(unique):
    excluded=adj[i]|{i}
    for neighbor in adj[i]:excluded=excluded|adj[neighbor]
    for _,j,distance in kd.find_range(Vector(p),.004):
        if j>i and j not in excluded:parent[find(j)]=find(i)
groups={}
for i in range(count):groups.setdefault(find(i),[]).append(i)
bindings=[g for g in groups.values() if len(g)>1]
for d in deltas.values():
    if hooded_jacket:
        d[protected]=0
        continue
    values=np.zeros((count,3));np.add.at(values,inverse,d);values/=counts[:,None]
    for group in bindings:
        values[group]=0 if hooded_jacket and np.any(protected[np.isin(inverse,group)]) else values[group].mean(axis=0)
    d[:]=values[inverse]
    if hooded_jacket:d[protected]=0
outer['delta']={'garment_'+n:d for n,d in deltas.items()};outer['defaults']={'garment_'+n:0 for n in names}
faces=[set(t) for t in inverse[tri]]
def self_pairs(p):
    bvh=tree(p,tri)
    return {(i,j) for i,j in bvh.overlap(bvh) if i<j and not faces[i]&faces[j]}
initial_self=self_pairs(base)
def normals(p):return np.cross(p[tri[:,1]]-p[tri[:,0]],p[tri[:,2]]-p[tri[:,0]])
n0=normals(base);valid=np.linalg.norm(n0,axis=1)>1e-12
def vertex_normals(p):
    n=np.zeros((count,3));f=normals(p)
    for axis in range(3):np.add.at(n,inverse[tri[:,axis]],f)
    n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-12);return n[inverse]

states=[('base',{}),('shoulder_max_chest_max',{'shoulder_width':1,'chest_volume':1}),
        ('waist_min_pelvis_max',{'waist_width':-1,'pelvis_width':1}),
        ('abdomen_max_pelvis_min',{'abdomen_front':.8,'pelvis_width':-1}),('restored',{})]
states += [(n+('_minus' if sign<0 else '_plus'),{n:sign}) for n in names if n!='abdomen_front' for sign in [-1,1]]
states += [('upper_corner_'+str(i),{**dict(zip(['shoulder_width','chest_volume','waist_width','pelvis_width'],v)),'abdomen_front':a})
           for i,(v,a) in enumerate(itertools.product(itertools.product([-1,1],repeat=4),[0,.8]))]

layer_fit={}
if long_sleeve and not hooded_jacket:
    # Solve a small *local* side-waist fit between the actual pants/body and
    # coat surfaces at the sampled signed states. Both baseline bias and the
    # pelvis displacement are constrained; no other garment is enlarged/edited.
    active=np.flatnonzero((np.abs(base[:,0])>.10)&(np.abs(base[:,0])<.24)&(base[:,2]>.89)&(base[:,2]<.98))
    bounds={sign:[np.full(len(base),-np.inf),np.full(len(base),np.inf)] for sign in [-1,0,1]}
    active_mask=np.zeros(len(base),dtype=bool);active_mask[active]=True
    local_faces=tri[np.all(active_mask[tri],axis=1)]
    for _,weights in states:
        state_points=points(outer,weights)
        surfaces={slot:tree(points(items[slot],weights),items[slot]['tri']) for slot in ['body','bottom','outer']}
        key=int(weights.get('pelvis_width',0))
        samples=[(np.array([i]),state_points[i]) for i in active]
        samples += [(ids,state_points[ids].mean(axis=0)) for ids in local_faces]
        for ids,sample in samples:
            sign=float(np.sign(sample[0]));direction=Vector((sign,0,0));origin=Vector((0,sample[1],sample[2]))
            hits={slot:surface.ray_cast(origin,direction,.4)[3] for slot,surface in surfaces.items()}
            if hits['body'] is None or hits['outer'] is None:continue
            lower=max(hits['body'],hits['bottom'] if hits['bottom'] is not None else 0)
            upper=hits['outer']
            if upper<=lower:continue
            gap=min(.0015,(upper-lower)*.3);current=sign*sample[0]
            bounds[key][0][ids]=np.maximum(bounds[key][0][ids],lower+gap-current)
            bounds[key][1][ids]=np.minimum(bounds[key][1][ids],upper-gap-current)
    for key,(lower,upper) in bounds.items():
        lo=np.full(count,-np.inf);hi=np.full(count,np.inf)
        np.maximum.at(lo,inverse,lower);np.minimum.at(hi,inverse,upper)
        bounds[key]=[lo[inverse],hi[inverse]]
    adjusted=0;infeasible=0
    for i in active:
        lp,up=bounds[1][0][i],bounds[1][1][i];lm,um=bounds[-1][0][i],bounds[-1][1][i];lz,uz=bounds[0][0][i],bounds[0][1][i]
        if not np.isfinite([lp,up,lm,um,lz,uz]).all():continue
        low=max(lz,(lp+lm)/2);high=min(uz,(up+um)/2)
        if low>high:infeasible+=1;continue
        a=np.clip(0,low,high);blow=max(lp-a,a-um);bhigh=min(up-a,a-lm)
        if blow>bhigh:infeasible+=1;continue
        b=np.clip(0,blow,bhigh)
        if max(abs(a),abs(b))>.006:infeasible+=1;continue
        sign=np.sign(base[i,0]);base[i,0]+=sign*a;deltas['pelvis_width'][i,0]+=sign*b
        if abs(a)+abs(b)>1e-8:adjusted+=1
    layer_fit={'adjusted_vertices':adjusted,'infeasible_vertices':infeasible,'max_base_adjustment_m':float(np.linalg.norm(base-source_base,axis=1).max())}
    print('LONG_LAYER_FIT',json.dumps(layer_fit),flush=True)
    initial_self=self_pairs(base);n0=normals(base);valid=np.linalg.norm(n0,axis=1)>1e-12

# Constrain only small folded patches that acquire a NEW crossing under sampled
# signed combinations. All five fields share each patch's rigid displacement;
# baseline geometry and its existing seven contacts are not deleted or hidden.
fold_patch_sizes=[]
parent=list(range(count))
unconstrained={name:d.copy() for name,d in deltas.items()}
for _ in range(0 if hooded_jacket else 10):
    pairs=set()
    for _,w in states:
        candidate=points(outer,w)
        pairs|=self_pairs(candidate)-initial_self
        flipped=np.flatnonzero(valid & (np.sum(normals(candidate)*n0,axis=1)<=0))
        pairs|={(int(i),int(i)) for i in flipped}
    if not pairs:break
    for i,j in pairs:
        ids=np.unique(inverse[np.concatenate([tri[i],tri[j]])])
        if hooded_jacket:
            ids=np.array(sorted(set(ids)|set().union(*(adj[int(v)] for v in ids))))
        if np.linalg.norm(np.ptp(unique[ids],axis=0))>.08:continue
        for vertex in ids[1:]:parent[find(int(vertex))]=find(int(ids[0]))
    patches={}
    for i in range(count):patches.setdefault(find(i),[]).append(i)
    patches=[g for g in patches.values() if len(g)>1]
    fold_patch_sizes.extend(map(len,patches))
    if not patches:break
    for name,d in deltas.items():
        values=np.zeros((count,3));np.add.at(values,inverse,unconstrained[name]);values/=counts[:,None]
        for group in patches:
            values[group]=0 if hooded_jacket and np.any(protected[np.isin(inverse,group)]) else values[group].mean(axis=0)
        d[:]=values[inverse]
        if hooded_jacket:d[protected]=0

# Near-degenerate inherited folds make unrestricted transferred fields unsafe.
# Calibrate one fixed asset-space strength across every control, not a runtime
# weight clamp: slider progression and additive signed morphs remain linear.
safe_strength=1.0
if hooded_jacket:
    original={name:d.copy() for name,d in deltas.items()}
    for strength in [1.0,.9,.8,.7,.6,.5,.4,.3]:
        for name,d in deltas.items():d[:]=original[name]*strength
        if all(not np.any(valid & (np.sum(normals(points(outer,w))*n0,axis=1)<=0)) for _,w in states):
            safe_strength=strength;break
    else:raise RuntimeError('Hood fields still reverse triangles at the conservative safety range')

if not rendering:
    checks=[]
    for label,w in states:
        p=points(outer,w);bvh=tree(p,tri);crossings=self_pairs(p)
        check={'state':label,'weights':w,'self_overlap_pairs':len(crossings),'introduced_self_pairs':len(crossings-initial_self),
               'introduced_self_locations':[p[tri[i]].mean(axis=0).tolist() for i,j in list(crossings-initial_self)[:4]],
               'flipped_triangles':int(np.sum(np.sum(normals(p)[valid]*n0[valid],axis=1)<=0))}
        if hooded_jacket:
            check['flipped_locations']=[p[tri[i]].mean(axis=0).tolist() for i in np.flatnonzero(valid & (np.sum(normals(p)*n0,axis=1)<=0))[:8]]
        for slot in (['body','bottom'] if hooded_jacket else ['body','outer','bottom'] if long_sleeve else ['body','top','bottom']):
            other=items[slot];surface=tree(points(other,w),other['tri']);pairs=surface.overlap(bvh)
            check[slot+'_overlap_pairs']=len(pairs)
            check[slot+'_overlap_locations']=[p[tri[j]].mean(axis=0).tolist() for _,j in pairs[:4]]
        checks.append(check)
    passing=all(c['body_overlap_pairs']==c['outer_overlap_pairs' if long_sleeve else 'top_overlap_pairs']==c['bottom_overlap_pairs']==0 and
                c['introduced_self_pairs']==c['flipped_triangles']==0 for c in checks) if not hooded_jacket else False
    if hooded_jacket:
        # This source already has known contacts. Record their deltas rather
        # than passing them off as collision-free or changing its base shape.
        passing=all(c['flipped_triangles']==0 for c in checks)
    if not passing:
        (assets/(asset_stem+'.candidate_checks.json')).write_text(json.dumps(checks,indent=2),encoding='utf8')
    assert passing,'Candidate failed collision/fold checks; inspect candidate_checks JSON'
    raw=sources[target_slot].read_bytes();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size])
    length=struct.unpack_from('<I',raw,20+size)[0];binary=bytearray(raw[28+size:28+size+length])
    primitive=doc['meshes'][0]['primitives'][0]
    def accessor(values):
        values=np.column_stack([values[:,0],values[:,2],-values[:,1]]).astype('<f4')
        while len(binary)%4:binary.append(0)
        offset=len(binary);binary.extend(values.tobytes())
        doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':values.nbytes})
        doc['accessors'].append({'bufferView':len(doc['bufferViews'])-1,'componentType':5126,'count':len(values),'type':'VEC3',
                                'min':values.min(axis=0).tolist(),'max':values.max(axis=0).tolist()})
        return len(doc['accessors'])-1
    base_normals=vertex_normals(base)
    primitive['attributes']['POSITION']=accessor(base)
    primitive['attributes']['NORMAL']=accessor(base_normals)
    for name,d in deltas.items():
        primitive.setdefault('targets',[]).append({'POSITION':accessor(d),'NORMAL':accessor(vertex_normals(base+d)-base_normals)})
        doc['meshes'][0].setdefault('extras',{}).setdefault('targetNames',[]).append('garment_'+name)
        doc['meshes'][0].setdefault('weights',[]).append(0)
    doc['buffers'][0]['byteLength']=len(binary)
    j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*(-len(j)%4);binary+=b'\0'*(-len(binary)%4)
    output.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary)
    obj=outer['obj']
    for i,v in enumerate(obj.data.vertices):v.co=base[i]
    obj.data.normals_split_custom_set_from_vertices(base_normals.tolist())
    obj.shape_key_add(name='Basis',from_mix=False)
    for name,d in deltas.items():
        k=obj.shape_key_add(name='garment_'+name,from_mix=False);k.slider_min=0 if name=='abdomen_front' else -1;k.slider_max=1;k.value=0
        for i,v in enumerate(k.data):v.co=base[i]+d[i]
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    assert all(sha(Path(p))==h for p,h in hashes.items())
    report={'source_hashes':hashes,'output_sha256':sha(output),'targets':['garment_'+n for n in names],
            'default_weights':[0]*5,'baseline_self_pairs':len(initial_self),
            'max_delta_m':{n:float(np.linalg.norm(d,axis=1).max()) for n,d in deltas.items()},'checks':checks,
            'method':'Body shoulder and inner-tee chest/waist/pelvis fields; broader abdomen drape; local smoothing, coherent fold patches and up to 6mm front-facing ease.',
            'strengths':{'shoulder':'body field','chest':1.02,'waist':.95,'abdomen_peak_m':.095,'pelvis':'inner-tee field'},
            'fold_binding_groups':len(bindings),'largest_fold_binding_group':max(map(len,bindings),default=0),
            'corrective_fold_patch_sizes':fold_patch_sizes,
            'base_geometry_unchanged':bool(np.array_equal(base,source_base)),'layer_fit':layer_fit,'local_front_facing_ease_max_m':float(np.linalg.norm(base-source_base,axis=1).max()),'browser_verified':False}
    if long_sleeve:
        report['method']='Existing body shoulder/chest/waist/pelvis fields with full sleeve shoulder translation; 90mm drape; capped smoothing/fold constraints; localized side-waist layer clearance calibration.'
        report['strengths']={'shoulder':'body field','chest':'body field','waist':'body field','abdomen_peak_m':.09,'pelvis':'body field'}
    if hooded_jacket:
        report.update(method='48-neighbor spatial Gaussian sampling of existing body fields (100mm radius); smooth torso-only abdomen drape; protected down hood/neckline; fixed safe asset strength; original zipper topology unchanged.',
            protected_indices=np.flatnonzero(protected).tolist(),protected_max_delta_m=max(float(np.linalg.norm(d[protected],axis=1).max()) for d in deltas.values()),
            supports_outer=False,supports_inner_top=False,
            safe_asset_strength=safe_strength,unresolved_introduced_self_pairs=max(c['introduced_self_pairs'] for c in checks),
            limitations='Source already has body, jeans and self contacts. Counts are diagnostics, not proof of a collision-free fit. Top slot replaces tee; padded jacket remains unsupported.')
        report['strengths']={'body_field_scale':safe_strength,'abdomen_peak_m':.09*safe_strength}
        report['fold_binding_groups']=0
        report['largest_fold_binding_group']=0
    report_path.write_text(json.dumps(report,indent=2),encoding='utf8')
    print('ONFIT_OUTER_MORPHS',json.dumps({'checks':len(checks),'baseline_self':len(initial_self),'worst_self':max(c['self_overlap_pairs'] for c in checks),
          'body_max':max(c['body_overlap_pairs'] for c in checks),'layer_max':None if hooded_jacket else max(c['outer_overlap_pairs' if long_sleeve else 'top_overlap_pairs'] for c in checks),'bottom_max':max(c['bottom_overlap_pairs'] for c in checks)}))
else:
    bpy.data.objects.remove(outer['obj'],do_unlink=True);outer=load(output);items[target_slot]=outer
    if long_sleeve:items['outer']['obj'].hide_render=True
    for item in items.values():
        obj=item['obj']
        if obj.data.shape_keys:
            for k in obj.data.shape_keys.key_blocks:
                if k.name.startswith('garment_') or k.name in names:k.slider_min=0 if 'abdomen' in k.name else -1
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=10;scene.cycles.use_denoising=True
    scene.render.resolution_x=360 if long_sleeve else 400;scene.render.resolution_y=540 if long_sleeve else 600;scene.render.resolution_percentage=100;scene.world.color=(.3,.3,.3)
    def aim(o,target=(0,0,.85)):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    for loc in [(2,-3,3),(-2,3,3),(-3,-1,2)]:
        d=bpy.data.lights.new('Softbox','AREA');d.energy=250;d.size=3
        o=bpy.data.objects.new('Softbox',d);scene.collection.objects.link(o);o.location=loc;aim(o)
    d=bpy.data.cameras.new('OutfitCamera');d.type='ORTHO';d.ortho_scale=1.9
    cam=bpy.data.objects.new('OutfitCamera',d);scene.collection.objects.link(cam);scene.camera=cam
    render_label=sys.argv[sys.argv.index('--label')+1] if '--label' in sys.argv else 'outer_bodymorph_v1'
    out=assets/'previews'/render_label;out.mkdir(parents=True,exist_ok=True)
    render_states=([states[0],*[(label,w) for label,w in states if label in ['shoulder_width_minus','shoulder_width_plus','chest_volume_minus','chest_volume_plus','waist_width_minus','waist_width_plus']],states[3],states[4]] if long_sleeve else states[:5])
    for label,w in render_states:
        for slot,item in items.items():
            for k in item['obj'].data.shape_keys.key_blocks:
                k.value=w.get(k.name.removeprefix('garment_'),item['defaults'].get(k.name,0))
        bpy.context.view_layer.update()
        # Evaluate the exported shape keys in Blender as a separate check from
        # the creation arrays and the browser-side Three.js vertex tests.
        e=outer['obj'].evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh()
        assert np.allclose(np.array([v.co[:] for v in m.vertices]),points(outer,w),atol=2e-7);e.to_mesh_clear()
        for view,loc in [('front',(0,-3,.85)),('side',(3,0,.85)),('back',(0,3,.85))]:
            path=out/f'{label}_{view}.png';assert not path.exists();cam.location=loc;aim(cam)
            scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    # Diagnostic close-ups of the inherited cuff/facing folds at baseline.
    for item in items.values():
        for k in item['obj'].data.shape_keys.key_blocks:k.value=item['defaults'].get(k.name,0)
    if long_sleeve and not hooded_jacket:items['outer']['obj'].hide_render=False
    else:items['bottom']['obj'].hide_render=True
    for view,loc in [('front',(0,-3,.85)),('side',(3,0,.85)),('back',(0,3,.85))]:
        combo_label='all_layers' if long_sleeve else 'top_outer'
        cam.location=loc;aim(cam);scene.render.filepath=str(out/f'{combo_label}_{view}.png');bpy.ops.render.render(write_still=True)
    if long_sleeve:items['outer']['obj'].hide_render=True
    else:items['bottom']['obj'].hide_render=False
    details=[('cuff',(.44,-.215,1.025),(.7,-1,1.12)),('neckline',(0,-.02,1.44),(0,-1,1.5))] if long_sleeve else [('cuff',(.44,-.215,1.025),(.7,-1,1.12)),('facing',(.048,-.21,.927),(.05,-1,.94))]
    for label,target,location in details:
        d.ortho_scale=.20;cam.location=location;aim(cam,target);scene.render.filepath=str(out/f'base_detail_{label}.png');bpy.ops.render.render(write_still=True)
    print('ONFIT_OUTER_MORPH_RENDERS',len(render_states)*3+5)
