"""Use installed MPFB anatomical macro targets; never overwrite source assets.
blender --background --factory-startup SOURCE.blend --python this.py -- --root FRONTEND
"""
import argparse, gzip, hashlib, json, sys
from pathlib import Path
import bpy
import numpy as np

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,required=True)
parser.add_argument('--version',default='v11')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root=args.root.resolve()
source=Path(bpy.data.filepath)
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_hash=digest(source)
output=root/f'public/models/ONFIT_Human_BodyBuild_{args.version}.glb'
blend=root.parent/f'assets/blender/ONFIT_Human_BodyBuild_{args.version}.blend'
report_path=output.with_suffix('.json')
assert not any(p.exists() for p in [output,blend,report_path]),'Refusing overwrite'
body=bpy.data.objects['Human'];keys=body.data.shape_keys.key_blocks
basis=np.array([p.co[:] for p in keys[0].data])
old={key.name:(key.value,np.array([p.co[:] for p in key.data])) for key in keys}
reference=basis.copy()
for key in list(keys)[1:]:reference+=key.value*(old[key.name][1]-basis)
mask=next(mod for mod in body.modifiers if mod.type=='MASK')
group=body.vertex_groups[mask.vertex_group]
keep=np.array([any(g.group==group.index and g.weight>mask.threshold for g in v.groups) for v in body.data.vertices])
target_dir=Path(bpy.utils.user_resource('EXTENSIONS'))/'blender_org/mpfb/data/targets/macrodetails'
if not target_dir.is_dir():
    target_dir=Path.home()/'AppData/Roaming/Blender Foundation/Blender/5.2/extensions/blender_org/mpfb/data/targets/macrodetails'
target_hashes={}
def target_file(path):
    target_hashes[path.name]=digest(path)
    result=np.zeros_like(basis)
    for line in gzip.decompress(path.read_bytes()).decode('utf8').splitlines():
        if not line.strip() or line.lstrip().startswith('#'):continue
        index,x,y,z=line.split()[:4]
        # MPFB TargetService uses X,-Z,Y into Blender, scaled by human scale.
        result[int(index)]=[float(x),-float(z),float(y)]
    return result
def target(gender,muscle,weight):
    return target_file(target_dir/f'universal-{gender}-young-{muscle}muscle-{weight}weight.target.gz')
average={gender:target(gender,'average','average') for gender in ['male','female']}
# Average-muscle targets are intentionally empty reference deltas. Calibrate
# units/topology against the nonzero Asian male target already in this model.
raw=target_file(target_dir/'asian-male-young.target.gz')
stored=old['$md-$as-$ma-$yn'][1]-basis
assert np.sum(raw*raw)>0
scale=float(np.sum(raw*stored)/np.sum(raw*raw))
assert np.max(np.abs(raw*scale-stored))<1e-5,'Target topology/unit mismatch'

def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
z=reference[:,2]
support=keep*smooth(.08,.18,z)*(1-smooth(1.43,1.53,z))
deltas={}
for name,muscle,strength in [('body_build_lean','min',.65),('body_build_muscular','max',.9)]:
    delta=sum(.5*(target(gender,muscle,'min')-average[gender]) for gender in ['male','female'])*scale
    delta*=strength
    # Authored anatomical targets, not uniform scaling: deltoids, upper/lower
    # arms, pectorals, latissimus, thighs and calves receive separate shapes.
    if muscle=='max':
        # Reference-style masculine athletic trunk. Replace the previous
        # half-female/half-male muscle interpolation with native male targets.
        # Face and groin are protected; average and lean keys are untouched.
        desired=.7*target('male','max','average')+.3*target('male','max','min')
        delta=desired*scale*.9
        for race in ['as','ca','af']:
            male=old[f'$md-${race}-$ma-$yn'][1]
            female_value,female=old[f'$md-${race}-$fe-$yn']
            transition=smooth(.76,.92,z)*(1-smooth(1.27,1.40,z))
            delta+=female_value*(male-female)*transition[:,None]
        for part,weight in [('torso/torso-muscle-pectoral-incr',.35),('torso/torso-muscle-dorsi-incr',.4),('stomach/stomach-tone-incr',.75)]:
            delta+=target_file(target_dir.parent/(part+'.target.gz'))*scale*weight
        for side in ['l','r']:
            for part,weight in [('upperarm-shoulder',.7),('upperarm',1.0),('lowerarm',.7)]:
                delta+=target_file(target_dir.parent/f'arms/{side}-{part}-muscle-incr.target.gz')*scale*weight
            for part,weight in [('upperleg',.95),('lowerleg',.7)]:
                delta+=target_file(target_dir.parent/f'legs/{side}-{part}-muscle-incr.target.gz')*scale*weight
        # Reduce the source's pointed cup contribution only in this build.
        # Broad, flat pectoral plates replace pointed forward amplification.
        for key_name,(value,coordinates) in old.items():
            if '$avcup' in key_name or '-maxcup-' in key_name:
                delta-=value*(coordinates-basis)
    deltas[name]=delta*support[:,None]
    if muscle=='max':
        # Keep the stronger deltoid/lat fields from folding the two armpits.
        ax,ay,az=reference.T
        armpit=(smooth(.15,.18,np.abs(ax))*(1-smooth(.23,.28,np.abs(ax)))*smooth(1.13,1.18,az)
            *(1-smooth(1.28,1.34,az))*(1-smooth(.055,.10,np.abs(ay)))*keep)
        adjacent=[set() for _ in basis]
        for edge in body.data.edges:
            a,b=edge.vertices;adjacent[a].add(b);adjacent[b].add(a)
        for _ in range(12):
            previous=deltas[name].copy()
            for index in np.flatnonzero(armpit>.001):
                neighbors=list(adjacent[index])
                if neighbors:deltas[name][index]=previous[index]+.4*armpit[index]*(np.mean(previous[neighbors],axis=0)-previous[index])
        # Blend overlapping native muscle fields across the shoulder girdle,
        # avoiding pad-like deltoids and pointed lats. Only the displacement
        # field is smoothed; original topology and surface remain untouched.
        upper=smooth(.89,1.0,az)*(1-smooth(1.40,1.49,az))*(1-smooth(.36,.46,np.abs(ax)))*keep
        for _ in range(10):
            previous=deltas[name].copy()
            for index in np.flatnonzero(upper>.001):
                neighbors=list(adjacent[index])
                if neighbors:deltas[name][index]=previous[index]+.25*upper[index]*(np.mean(previous[neighbors],axis=0)-previous[index])
    key=body.shape_key_add(name=name,from_mix=False);key.relative_key=keys[0]
    key.value=0;key.slider_min=0;key.slider_max=1
    key.data.foreach_set('co',(basis+deltas[name]).ravel())

# Smooth local front-depth correction shared by all builds. This leaves
# shoulder span, chest lateral width, the back, waist and original keys intact.
x,y,z=reference.T
relief=np.zeros_like(reference)
relief[:,1]=(.012*smooth(1.14,1.20,z)*(1-smooth(1.29,1.38,z))
    *(1-smooth(.13,.21,np.abs(x)))*(1-smooth(-.035,.025,y))*keep)
key=body.shape_key_add(name='body_chest_relief',from_mix=False);key.relative_key=keys[0]
key.data.foreach_set('co',(basis+relief).ravel());key.value=1;key.slider_min=0;key.slider_max=1

# The source has stomach-pregnant-incr at 0.5 even when the user's abdominal
# slider is zero. Cancel 80% of that authored anterior expansion, separately
# from the user-controlled abdomen_front key. Preserve the original weight.
pregnant_value,pregnant_coords=old['stomach-pregnant-incr']
abdomen_support=smooth(.85,.94,z)*(1-smooth(1.17,1.23,z))*(1-smooth(.16,.23,np.abs(x)))*(1-smooth(-.025,.025,y))*keep
abdomen_relief=-.8*pregnant_value*(pregnant_coords-basis)*abdomen_support[:,None]
key=body.shape_key_add(name='body_abdomen_relief',from_mix=False);key.relative_key=keys[0]
key.data.foreach_set('co',(basis+abdomen_relief).ravel());key.value=1;key.slider_min=0;key.slider_max=1

# Artistic rectus-abdominis relief: three paired broad bellies plus a shallow
# midline and transverse separations. Millimetric actual mesh displacement,
# not a pasted muscle picture or a medical reconstruction.
sculpt_reference=reference+relief+abdomen_relief+deltas['body_build_muscular']
sx,sy,sz=sculpt_reference.T
# Use surface orientation rather than an assumed world-Y threshold: the
# reference-style athletic torso is flatter and has a different front depth.
body.data.calc_loop_triangles()
sculpt_triangles=np.array([tuple(t.vertices) for t in body.data.loop_triangles])
tri=sculpt_reference[sculpt_triangles]
face_normals=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
vertex_normals=np.zeros_like(reference)
for corner in range(3):np.add.at(vertex_normals,sculpt_triangles[:,corner],face_normals)
vertex_normals/=np.maximum(np.linalg.norm(vertex_normals,axis=1)[:,None],1e-9)
front=smooth(.15,.65,-vertex_normals[:,1])
abs_support=smooth(1.015,1.045,sz)*(1-smooth(1.185,1.215,sz))*(1-smooth(.095,.135,np.abs(sx)))*front*keep
lobes=np.zeros_like(sx)
for horizontal in [-.041,.041]:
    for height in [1.065,1.115,1.165]:
        lobes+=np.exp(-.5*((sx-horizontal)/.022)**2-.5*((sz-height)/.015)**2)
grooves=.0035*np.exp(-.5*(sx/.009)**2)
for height in [1.09,1.14]:grooves+=.0025*np.exp(-.5*((sz-height)/.007)**2)
abdominal_definition=np.zeros_like(reference)
abdominal_definition[:,1]=(-.010*lobes+grooves)*abs_support
key=body.shape_key_add(name='body_abdominal_definition',from_mix=False);key.relative_key=keys[0]
key.data.foreach_set('co',(basis+abdominal_definition).ravel());key.value=0;key.slider_min=0;key.slider_max=1

# Finite coordinates, no new degenerate/flipped triangles at preset endpoints
# and with existing moderate regional controls. Not a self-intersection proof.
triangles=[]
body.data.calc_loop_triangles()
for triangle in body.data.loop_triangles:
    if keep[list(triangle.vertices)].all():triangles.append(tuple(triangle.vertices))
triangles=np.array(triangles)
def normals(points):
    t=points[triangles];return np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0])
base_normals=normals(reference)
corrected_reference=reference+relief+abdomen_relief
relief_flips=int(np.sum(np.sum(normals(corrected_reference)*base_normals,axis=1)<0))
assert relief_flips==0
checks=[{'target':'shared_relief','weight':1,'flipped_triangles':relief_flips,'max_displacement_m':float(np.linalg.norm(relief+abdomen_relief,axis=1).max())}]
base_normals=normals(corrected_reference)
for name,delta in deltas.items():
    for weight in [.5,1.0]:
        coordinates=corrected_reference+delta*weight+(abdominal_definition*weight if name=='body_build_muscular' else 0)
        n=normals(coordinates)
        flips=int(np.sum(np.sum(n*base_normals,axis=1)<0))
        if flips:print('FLIPPED_REGIONS',reference[triangles[np.sum(n*base_normals,axis=1)<0]].mean(axis=1).tolist(),flush=True)
        assert np.isfinite(coordinates).all() and flips==0,(name,weight,flips)
        checks.append({'target':name,'weight':weight,'flipped_triangles':flips,'max_displacement_m':float(np.linalg.norm(delta*weight,axis=1).max())})
for name,(value,coordinates) in old.items():
    assert keys[name].value==value and np.array_equal(np.array([p.co[:] for p in keys[name].data]),coordinates)
assert all(keys[name].value==0 for name in deltas)
blend.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
working=body.copy();working.data=body.data.copy();working.name='ONFIT_Human_BodyBuild_'+args.version
bpy.context.scene.collection.objects.link(working)
bpy.ops.object.select_all(action='DESELECT');working.select_set(True);bpy.context.view_layer.objects.active=working
working.active_shape_key_index=0
for mod in working.modifiers:mod.show_viewport=mod.show_render=False
for polygon in working.data.polygons:polygon.select=False
for edge in working.data.edges:edge.select=False
for vertex in working.data.vertices:vertex.select=not bool(keep[vertex.index])
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.delete(type='VERT');bpy.ops.object.mode_set(mode='OBJECT')
for mod in list(working.modifiers):working.modifiers.remove(mod)
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_apply=False,export_morph=True,export_morph_normal=True,export_animations=False)
assert digest(source)==source_hash
report={'source':str(source),'source_sha256':source_hash,'output':str(output),'glb_sha256':digest(output),'blend':str(blend),
    'scale':scale,'targets':target_hashes,'checks':checks,'original_keys_preserved':True,'default_restores_exactly':True,'chest_relief_default':1,'abdomen_relief_default':1,
    'source_pregnancy_weight':pregnant_value,'pregnancy_anterior_cancel_fraction':.8,'abdomen_relief_max_m':float(np.linalg.norm(abdomen_relief,axis=1).max()),
    'abs_changed_vertices':int(np.sum(np.linalg.norm(abdominal_definition,axis=1)>1e-7)),'abs_depth_range_m':[float(abdominal_definition[:,1].min()),float(abdominal_definition[:,1].max())],
    'license':'CC0 core MPFB targets','license_url':'https://static.makehumancommunity.org/mpfb/faq/can_i_sell_models.html',
    'limitations':'Artistic macro targets, not InBody reconstruction. Detailed muscles and clothing clearance require visual validation.'}
report_path.write_text(json.dumps(report,indent=2),encoding='utf8')
print('ONFIT_BODY_BUILDS',json.dumps(report))
