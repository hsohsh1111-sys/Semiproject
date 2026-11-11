import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { HOODED_JACKET_MORPH_GLB, getTopGarment, PANTS_GLB, applyGarmentMorphs, loadGarmentAsset, disposeGarmentAsset } from './garmentGlb.js'
import { bodyMorphWeights, applyBodyMorphs, BODY_MORPH_MODEL_URL } from './bodyMorphs.js'
import { captureMorphWeights } from './glbGeometry.js'
import { createModelAppearance } from './garmentAppearance.js'

const folder=new URL('../../../public/models/',import.meta.url),read=name=>readFile(new URL(name,folder))
// Tests exercise real GLTFLoader and vertex evaluation. Browser image decoding
// and actual WebGL rendering are deliberately not claimed by the texture stub.
const loader=()=>new GLTFLoader().register(()=>({name:'NodeTextureDecodeStub',loadTexture:()=>Promise.resolve(new Texture())}))
async function load(name){const b=await read(name);return loader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')}
const garment=await load('ONFIT_HoodedJacket_BodyMorph_v1.glb'),old=await load('ONFIT_HoodedJacket_v1.glb')
const body=await load('ONFIT_Human_BodyMorph_v3.glb'),pants=await load('ONFIT_Pants_BodyMorph_v2.glb')
const report=JSON.parse(await read('ONFIT_HoodedJacket_BodyMorph_v1.json'))
const mesh=s=>{let m;s.traverse(o=>{if(o.isMesh)m=o});return m}
const coords=m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,new Vector3()).toArray())
const near=(a,b)=>assert.ok(Math.abs(a-b)<2e-6,`${a} != ${b}`)
const neutral={shoulder_width_m:.42,chest_radius_m:.95/(2*Math.PI),waist_radius_m:.80/(2*Math.PI),abdomen_protrusion_m:0,pelvis_width_m:.30}
const fields=[['shoulder_width_m','shoulder_width',.25,.65],['chest_radius_m','chest_volume',.55/(2*Math.PI),1.80/(2*Math.PI)],['waist_radius_m','waist_width',.45/(2*Math.PI),1.80/(2*Math.PI)],['abdomen_protrusion_m','abdomen_front',0,.20],['pelvis_width_m','pelvis_width',.20,.60]]
function setup(){const scene=garment.scene.clone(true),m=mesh(scene),defaults=captureMorphWeights(scene);return{scene,m,apply:p=>applyGarmentMorphs(scene,defaults,bodyMorphWeights(p),HOODED_JACKET_MORPH_GLB.url)}}

test('hood GLB preserves exact baseline, authored UV/index/material/image buffers, five zero-default targets and original files',async()=>{
  const m=mesh(garment.scene),before=mesh(old.scene)
  assert.equal(getTopGarment('hooded_jacket'),HOODED_JACKET_MORPH_GLB)
  assert.deepEqual(Object.keys(m.morphTargetDictionary),fields.map(f=>'garment_'+f[1]))
  assert.deepEqual(m.morphTargetInfluences,[0,0,0,0,0])
  for(const key of ['position','uv'])assert.deepEqual(m.geometry.attributes[key].array,before.geometry.attributes[key].array)
  assert.deepEqual(m.geometry.index.array,before.geometry.index.array)
  const raw=await read('ONFIT_HoodedJacket_v1.glb'),now=await read('ONFIT_HoodedJacket_BodyMorph_v1.glb')
  const binary=b=>{const n=b.readUInt32LE(12);return b.subarray(28+n,28+n+b.readUInt32LE(20+n))}
  assert.ok(binary(now).subarray(0,binary(raw).length).equals(binary(raw)))
  const doc=b=>JSON.parse(b.subarray(20,20+b.readUInt32LE(12)))
  for(const name of ['materials','textures','images','samplers','nodes'])assert.deepEqual(doc(now)[name],doc(raw)[name])
  for(const [path,hash]of Object.entries(report.source_hashes))assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),hash)
  assert.equal(createHash('sha256').update(now).digest('hex'),report.output_sha256)
  assert.equal(createModelAppearance(garment.scene,HOODED_JACKET_MORPH_GLB),null)
})

for(const [field,name,min,max]of fields)test(`hood ${name}: real signed positions, progressive weights, independent controls, restoration`,()=>{
  const {m,apply}=setup();apply(neutral);const base=coords(m)
  apply({...neutral,[field]:max});const plus=coords(m),peak=name==='abdomen_front'?.8:1
  near(m.morphTargetInfluences[m.morphTargetDictionary['garment_'+name]],peak)
  assert.ok(base.some((p,i)=>Math.hypot(...plus[i].map((v,a)=>v-p[a]))>1e-5))
  if(name!=='abdomen_front'){
    apply({...neutral,[field]:min});const minus=coords(m)
    near(m.morphTargetInfluences[m.morphTargetDictionary['garment_'+name]],-1)
    base.forEach((p,i)=>p.forEach((v,a)=>near(minus[i][a]-v,-(plus[i][a]-v))))
  }
  for(const fraction of [0,.25,.5,.75,1]){
    apply({...neutral,[field]:neutral[field]+(max-neutral[field])*fraction})
    near(m.morphTargetInfluences[m.morphTargetDictionary['garment_'+name]],peak*fraction)
    for(const [,other]of fields)if(other!==name)near(m.morphTargetInfluences[m.morphTargetDictionary['garment_'+other]],0)
    const actual=coords(m)
    base.forEach((p,i)=>p.forEach((v,a)=>near(actual[i][a]-v,(plus[i][a]-v)*fraction)))
  }
  apply(neutral);assert.deepEqual(coords(m),base)
})

test('body/hood/pants share weights; hood stays protected and full sleeves follow shoulders without moving materials',()=>{
  const target=setup(),human=body.scene.clone(true),bottom=pants.scene.clone(true)
  const p={...neutral,shoulder_width_m:.65,chest_radius_m:1.8/(2*Math.PI),waist_radius_m:.45/(2*Math.PI),abdomen_protrusion_m:.20,pelvis_width_m:.20}
  target.apply(p);applyBodyMorphs(human,captureMorphWeights(human),p,BODY_MORPH_MODEL_URL)
  applyGarmentMorphs(bottom,captureMorphWeights(bottom),bodyMorphWeights(p),PANTS_GLB.url)
  for(const scene of [target.scene,bottom])for(const [name,index]of Object.entries(mesh(scene).morphTargetDictionary)){
    const key=name.replace('garment_',''),h=mesh(human)
    near(mesh(scene).morphTargetInfluences[index],h.morphTargetInfluences[h.morphTargetDictionary[key]])
  }
  const m=target.m,base=m.geometry.attributes.position,index=m.morphTargetDictionary.garment_shoulder_width,delta=m.geometry.morphAttributes.position[index]
  for(const [minX,maxX]of [[.29,.38],[.42,.55]]){
    let changed=0
    for(let i=0;i<base.count;i++)if(Math.abs(base.getX(i))>minX&&Math.abs(base.getX(i))<maxX&&Math.abs(delta.getX(i))>.001)changed++
    assert.ok(changed>10,'Elbow and wrist must follow the shoulder')
  }
  assert.ok(report.protected_indices.length>10)
  for(const i of report.protected_indices){const actual=m.getVertexPosition(i,new Vector3());near(actual.x,base.getX(i));near(actual.y,base.getY(i));near(actual.z,base.getZ(i))}
  assert.deepEqual(mesh(garment.scene).morphTargetInfluences,[0,0,0,0,0])
})

test('slider updates reuse the loaded asset rather than requesting GLB repeatedly',async()=>{
  const bytes=await read('ONFIT_HoodedJacket_BodyMorph_v1.glb');let requests=0
  const result=await loadGarmentAsset(HOODED_JACKET_MORPH_GLB.url,{loader:loader(),fetcher:async()=>{requests++;return{ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}}})
  const defaults=captureMorphWeights(result.scene)
  for(let i=0;i<=20;i++)applyGarmentMorphs(result.scene,defaults,bodyMorphWeights({...neutral,abdomen_protrusion_m:i/100}),HOODED_JACKET_MORPH_GLB.url)
  assert.equal(requests,1);disposeGarmentAsset(result.asset)
})

test('diagnostics disclose existing contacts and reject unsupported inner-top/outer combinations',()=>{
  assert.equal(report.checks.length,45)
  assert.equal(report.base_geometry_unchanged,true)
  assert.equal(report.protected_max_delta_m,0)
  assert.equal(report.supports_outer,false);assert.equal(report.supports_inner_top,false)
  for(const c of report.checks)assert.equal(c.flipped_triangles,0,c.state)
  assert.equal(Math.max(...report.checks.map(c=>c.introduced_self_pairs)),report.unresolved_introduced_self_pairs)
  assert.ok(report.baseline_self_pairs>0)
  assert.ok(report.checks[0].body_overlap_pairs>0)
  assert.equal(report.browser_verified,false)
})
