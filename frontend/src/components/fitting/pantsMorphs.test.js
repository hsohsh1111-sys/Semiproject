import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { PANTS_GLB, TSHIRT_MORPH_GLB, applyGarmentMorphs } from './garmentGlb.js'
import { bodyMorphWeights, applyBodyMorphs, BODY_MORPH_MODEL_URL } from './bodyMorphs.js'
import { captureMorphWeights } from './glbGeometry.js'
import { createModelAppearance, GARMENT_COLORS } from './garmentAppearance.js'

const folder=new URL('../../../public/models/',import.meta.url)
const read=name=>readFile(new URL(name,folder))
async function load(name){const b=await read(name);return new GLTFLoader().register(()=>({name:'NodeTextureDecodeStub',loadTexture:()=>Promise.resolve(new Texture())})).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')}
const pants=await load('ONFIT_Pants_BodyMorph_v1.glb'),old=await load('ONFIT_Pants_v1.glb')
const shirt=await load('ONFIT_TShirt_BodyMorph_v4.glb'),oldShirt=await load('ONFIT_TShirt_BodyMorph_v3.glb'),body=await load('ONFIT_Human_BodyMorph_v3.glb')
const report=JSON.parse(await read('ONFIT_Pants_BodyMorph_v1.json'))
const mesh=scene=>{let m;scene.traverse(o=>{if(o.isMesh)m=o});return m}
const coords=m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,new Vector3()).toArray())
const near=(a,b)=>assert.ok(Math.abs(a-b)<2e-6,`${a} != ${b}`)
const neutral={waist_radius_m:.8/(2*Math.PI),pelvis_width_m:.30,hip_radius_m:.95/(2*Math.PI),thigh_radius_m:.50/(2*Math.PI),abdomen_protrusion_m:0}
const fields=[['waist_radius_m','waist_width',.45/(2*Math.PI),1.8/(2*Math.PI)],['pelvis_width_m','pelvis_width',.20,.60],['hip_radius_m','hip_volume',.55/(2*Math.PI),1.8/(2*Math.PI)],['thigh_radius_m','thigh_girth',.25/(2*Math.PI),1/(2*Math.PI)]]
function setup(asset=pants,url=PANTS_GLB.url){const scene=asset.scene.clone(true),m=mesh(scene),defaults=captureMorphWeights(scene);return{scene,m,apply:p=>applyGarmentMorphs(scene,defaults,bodyMorphWeights(p),url)}}

test('pants export has four zero-default targets and preserves source UV/index/material/embedded texture bytes',async()=>{
  const m=mesh(pants.scene),previous=mesh(old.scene)
  assert.equal(PANTS_GLB.url,'/models/ONFIT_Pants_BodyMorph_v2.glb')
  assert.deepEqual(Object.keys(m.morphTargetDictionary),fields.map(f=>'garment_'+f[1]))
  assert.deepEqual(m.morphTargetInfluences,[0,0,0,0])
  assert.equal(m.geometry.attributes.position.count,previous.geometry.attributes.position.count)
  assert.deepEqual(m.geometry.attributes.uv.array,previous.geometry.attributes.uv.array)
  assert.deepEqual(m.geometry.index.array,previous.geometry.index.array)
  assert.equal(m.material.transparent,previous.material.transparent)
  assert.ok(m.material.map && m.material.normalMap)
  const binary=b=>{const n=b.readUInt32LE(12);return b.subarray(28+n,28+n+b.readUInt32LE(20+n))}
  const a=binary(await read('ONFIT_Pants_v1.glb')),b=binary(await read('ONFIT_Pants_BodyMorph_v1.glb'))
  assert.ok(b.subarray(0,a.length).equals(a))
  for(const [p,hash]of Object.entries(report.source_hashes))assert.equal(createHash('sha256').update(await readFile(p)).digest('hex'),hash)
  assert.equal(createHash('sha256').update(await read('ONFIT_Pants_BodyMorph_v1.glb')).digest('hex'),report.output_sha256)
  assert.equal(createHash('sha256').update(await read('ONFIT_TShirt_BodyMorph_v4.glb')).digest('hex'),report.top_output_sha256)
})

for(const [field,name,min,max]of fields)test(`pants ${name}: real negative/positive vertices, continuous mapping, independent weights and exact reset`,()=>{
  const {m,apply}=setup();apply(neutral);const base=coords(m)
  apply({...neutral,[field]:min});const minus=coords(m)
  near(m.morphTargetInfluences[m.morphTargetDictionary['garment_'+name]],-1)
  apply({...neutral,[field]:max});const plus=coords(m)
  near(m.morphTargetInfluences[m.morphTargetDictionary['garment_'+name]],1)
  let changed=0
  base.forEach((p,i)=>{
    if(Math.hypot(...plus[i].map((v,a)=>v-p[a]))>1e-6)changed++
    p.forEach((v,a)=>near(minus[i][a]-v,-(plus[i][a]-v)))
  })
  assert.ok(changed>100)
  for(const [,other]of fields)if(other!==name)near(m.morphTargetInfluences[m.morphTargetDictionary['garment_'+other]],0)
  const reference=neutral[field]
  for(const fraction of [0,.25,.5,.75,1]){
    apply({...neutral,[field]:reference+(max-reference)*fraction})
    near(m.morphTargetInfluences[m.morphTargetDictionary['garment_'+name]],fraction)
    const current=coords(m)
    base.forEach((p,i)=>p.forEach((v,a)=>near(current[i][a]-v,(plus[i][a]-v)*fraction)))
  }
  apply(neutral);assert.deepEqual(coords(m),base)
})

test('body, top and bottom share weights; combined vertices accumulate and colors preserve denim and morph defaults',()=>{
  const lower=setup(),upper=setup(shirt,TSHIRT_MORPH_GLB.url),human=body.scene.clone(true),h=mesh(human),defaults=captureMorphWeights(human)
  const p={...neutral,waist_radius_m:1.8/(2*Math.PI),pelvis_width_m:.25,hip_radius_m:1.8/(2*Math.PI),thigh_radius_m:.25/(2*Math.PI),abdomen_protrusion_m:.20}
  lower.apply(p);upper.apply(p);applyBodyMorphs(human,defaults,p,BODY_MORPH_MODEL_URL)
  for(const [,name]of fields)near(lower.m.morphTargetInfluences[lower.m.morphTargetDictionary['garment_'+name]],h.morphTargetInfluences[h.morphTargetDictionary[name]])
  near(upper.m.morphTargetInfluences[upper.m.morphTargetDictionary.garment_hip_volume],1)
  const base=lower.m.geometry.attributes.position,actual=coords(lower.m)
  actual.forEach((v,i)=>v.forEach((value,axis)=>{
    let expected=base.array[3*i+axis]
    lower.m.morphTargetInfluences.forEach((w,j)=>expected+=w*lower.m.geometry.morphAttributes.position[j].array[3*i+axis])
    near(value,expected)
  }))
  const original=lower.m.material,appearance=createModelAppearance(upper.scene,TSHIRT_MORPH_GLB)
  assert.equal(createModelAppearance(lower.scene,PANTS_GLB),null)
  for(const color of GARMENT_COLORS){appearance.setColor(color.id);assert.equal(lower.m.material,original);assert.deepEqual(coords(lower.m),actual)}
  appearance.dispose();assert.deepEqual(mesh(pants.scene).morphTargetInfluences,[0,0,0,0])
})

test('layered top preserves original five morphs and UVs; hem offset stays local, small, and at the same height',()=>{
  const m=mesh(shirt.scene),before=mesh(oldShirt.scene)
  assert.equal(m.morphTargetInfluences.length,6)
  assert.deepEqual(m.geometry.attributes.uv.array,before.geometry.attributes.uv.array)
  assert.deepEqual(m.geometry.index.array,before.geometry.index.array)
  for(let i=0;i<5;i++)assert.deepEqual(m.geometry.morphAttributes.position[i].array,before.geometry.morphAttributes.position[i].array)
  const a=m.geometry.attributes.position.array,b=before.geometry.attributes.position.array
  for(let i=0;i<a.length;i+=3){near(a[i+1],b[i+1]);assert.ok(Math.hypot(a[i]-b[i],a[i+2]-b[i+2])<.006);if(b[i+1]>=.98){near(a[i],b[i]);near(a[i+2],b[i+2])}}
})

test('Blender signed checks cover requested combinations, corners, restoration and triangle-level collision/fold checks',()=>{
  assert.equal(report.blender_signed_vertex_checks,true)
  assert.equal(report.checks.length,29)
  for(const c of report.checks){assert.equal(c.body_overlap_pairs,0,c.state);assert.equal(c.top_overlap_pairs,0,c.state);assert.equal(c.self_overlap_pairs,0,c.state);assert.equal(c.flipped_triangles,0,c.state);assert.ok(c.min_gap_m>0,c.state)}
  assert.deepEqual(report.checks.at(-1).weights,{})
})
