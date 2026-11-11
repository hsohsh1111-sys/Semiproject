import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OUTER_GLB, TSHIRT_MORPH_GLB, PANTS_GLB, applyGarmentMorphs, loadGarmentAsset, disposeGarmentAsset } from './garmentGlb.js'
import { bodyMorphWeights, applyBodyMorphs, BODY_MORPH_MODEL_URL } from './bodyMorphs.js'
import { captureMorphWeights } from './glbGeometry.js'
import { createModelAppearance, GARMENT_COLORS } from './garmentAppearance.js'

const folder=new URL('../../../public/models/',import.meta.url)
const read=name=>readFile(new URL(name,folder))
const loader=()=>new GLTFLoader().register(()=>({name:'NodeTextureDecodeStub',loadTexture:()=>Promise.resolve(new Texture())}))
async function load(name){const b=await read(name);return loader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')}
const outer=await load('ONFIT_Outer_BodyMorph_v1.glb'),original=await load('ONFIT_Outer_v1.glb')
const top=await load('ONFIT_TShirt_BodyMorph_v5.glb'),bottom=await load('ONFIT_Pants_BodyMorph_v2.glb'),body=await load('ONFIT_Human_BodyMorph_v3.glb')
const report=JSON.parse(await read('ONFIT_Outer_BodyMorph_v1.json'))
const mesh=s=>{let m;s.traverse(o=>{if(o.isMesh)m=o});return m}
const coords=m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,new Vector3()).toArray())
const near=(a,b)=>assert.ok(Math.abs(a-b)<2e-6,`${a} != ${b}`)
const neutral={shoulder_width_m:.42,chest_radius_m:.95/(2*Math.PI),waist_radius_m:.80/(2*Math.PI),abdomen_protrusion_m:0,pelvis_width_m:.30}
const fields=[['shoulder_width_m','shoulder_width',.25,.65],['chest_radius_m','chest_volume',.55/(2*Math.PI),1.80/(2*Math.PI)],['waist_radius_m','waist_width',.45/(2*Math.PI),1.80/(2*Math.PI)],['abdomen_protrusion_m','abdomen_front',0,.20],['pelvis_width_m','pelvis_width',.20,.60]]
function setup(){const scene=outer.scene.clone(true),m=mesh(scene),defaults=captureMorphWeights(scene);return{scene,m,apply:p=>applyGarmentMorphs(scene,defaults,bodyMorphWeights(p),OUTER_GLB.url)}}

test('actual jacket export has five zero-default targets, local 6mm facing ease and exact source topology/UV/material/texture buffers',async()=>{
  assert.equal(OUTER_GLB.url,'/models/ONFIT_Outer_BodyMorph_v1.glb')
  const m=mesh(outer.scene),old=mesh(original.scene)
  assert.deepEqual(Object.keys(m.morphTargetDictionary),fields.map(f=>'garment_'+f[1]))
  assert.deepEqual(m.morphTargetInfluences,[0,0,0,0,0])
  assert.deepEqual(m.geometry.attributes.uv.array,old.geometry.attributes.uv.array)
  const a=m.geometry.attributes.position.array,b=old.geometry.attributes.position.array
  for(let i=0;i<a.length;i+=3){near(a[i],b[i]);near(a[i+1],b[i+1]);assert.ok(Math.abs(a[i+2]-b[i+2])<=.006001)}
  assert.ok(report.local_front_facing_ease_max_m<=.006001)
  assert.deepEqual(m.geometry.index.array,old.geometry.index.array)
  const raw=await read('ONFIT_Outer_v1.glb'),now=await read('ONFIT_Outer_BodyMorph_v1.glb')
  const binary=b=>{const n=b.readUInt32LE(12);return b.subarray(28+n,28+n+b.readUInt32LE(20+n))}
  assert.ok(binary(now).subarray(0,binary(raw).length).equals(binary(raw)))
  const doc=b=>JSON.parse(b.subarray(20,20+b.readUInt32LE(12)))
  for(const field of ['materials','textures','images','samplers','nodes'])assert.deepEqual(doc(now)[field],doc(raw)[field])
  for(const [path,hash]of Object.entries(report.source_hashes))assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),hash)
  assert.equal(createHash('sha256').update(now).digest('hex'),report.output_sha256)
})

for(const [field,name,min,max]of fields)test(`outer ${name}: actual signed vertices, gradual full-range response, independent weights and exact restoration`,()=>{
  const {m,apply}=setup();apply(neutral);const base=coords(m)
  apply({...neutral,[field]:max});const plus=coords(m),peak=name==='abdomen_front'?.8:1
  near(m.morphTargetInfluences[m.morphTargetDictionary['garment_'+name]],peak)
  assert.ok(base.some((p,i)=>Math.hypot(...plus[i].map((v,a)=>v-p[a]))>1e-5))
  if(name!=='abdomen_front'){
    apply({...neutral,[field]:min});const minus=coords(m)
    near(m.morphTargetInfluences[m.morphTargetDictionary['garment_'+name]],-1)
    base.forEach((p,i)=>p.forEach((v,a)=>near(minus[i][a]-v,-(plus[i][a]-v))))
  }
  const reference=neutral[field]
  for(const fraction of [0,.25,.5,.75,1]){
    apply({...neutral,[field]:reference+(max-reference)*fraction})
    near(m.morphTargetInfluences[m.morphTargetDictionary['garment_'+name]],peak*fraction)
    for(const [,other]of fields)if(other!==name)near(m.morphTargetInfluences[m.morphTargetDictionary['garment_'+other]],0)
    const actual=coords(m)
    base.forEach((p,i)=>p.forEach((v,a)=>near(actual[i][a]-v,(plus[i][a]-v)*fraction)))
  }
  apply(neutral);assert.deepEqual(coords(m),base)
})

test('body/top/bottom/outer accumulate the same state without mutating caches, colors, default weights or unsupported jacket fields',()=>{
  const jacket=setup(),shirt=top.scene.clone(true),pants=bottom.scene.clone(true),human=body.scene.clone(true)
  const p={...neutral,shoulder_width_m:.65,chest_radius_m:1.8/(2*Math.PI),waist_radius_m:.45/(2*Math.PI),abdomen_protrusion_m:.20,pelvis_width_m:.20,hip_radius_m:1.8/(2*Math.PI),thigh_radius_m:.25/(2*Math.PI)}
  jacket.apply(p)
  applyGarmentMorphs(shirt,captureMorphWeights(shirt),bodyMorphWeights(p),TSHIRT_MORPH_GLB.url)
  applyGarmentMorphs(pants,captureMorphWeights(pants),bodyMorphWeights(p),PANTS_GLB.url)
  applyBodyMorphs(human,captureMorphWeights(human),p,BODY_MORPH_MODEL_URL)
  for(const scene of [jacket.scene,shirt,pants])for(const [name,index]of Object.entries(mesh(scene).morphTargetDictionary)){
    const key=name.replace('garment_',''),h=mesh(human)
    near(mesh(scene).morphTargetInfluences[index],h.morphTargetInfluences[h.morphTargetDictionary[key]])
  }
  assert.equal(jacket.m.morphTargetDictionary.garment_hip_volume,undefined)
  assert.equal(jacket.m.morphTargetDictionary.garment_thigh_girth,undefined)
  const actual=coords(jacket.m),base=jacket.m.geometry.attributes.position.array
  actual.forEach((p,i)=>p.forEach((v,a)=>{
    let expected=base[3*i+a]
    jacket.m.morphTargetInfluences.forEach((w,k)=>expected+=w*jacket.m.geometry.morphAttributes.position[k].array[3*i+a])
    near(v,expected)
  }))
  const material=jacket.m.material,appearance=createModelAppearance(shirt,TSHIRT_MORPH_GLB)
  assert.equal(createModelAppearance(jacket.scene,OUTER_GLB),null)
  for(const color of GARMENT_COLORS){appearance.setColor(color.id);assert.equal(jacket.m.material,material);assert.deepEqual(coords(jacket.m),actual)}
  appearance.dispose();assert.deepEqual(mesh(outer.scene).morphTargetInfluences,[0,0,0,0,0])
})

test('loaded authored jacket updates weights without refetching and can unmount/reload independently',async()=>{
  const bytes=await read('ONFIT_Outer_BodyMorph_v1.glb');let requests=0
  for(let i=0;i<2;i++){
    const result=await loadGarmentAsset(OUTER_GLB.url,{loader:loader(),fetcher:async()=>{requests++;return{ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}}})
    const defaults=captureMorphWeights(result.scene)
    for(let j=0;j<=20;j++)applyGarmentMorphs(result.scene,defaults,bodyMorphWeights({...neutral,abdomen_protrusion_m:j/100}),OUTER_GLB.url)
    assert.equal(requests,i+1)
    disposeGarmentAsset(result.asset)
  }
})

test('45 measured states preserve inherited contacts without new self-crossing, triangle flips or body/inner garment penetration',()=>{
  assert.equal(report.checks.length,45);assert.equal(report.baseline_self_pairs,7)
  for(const c of report.checks){
    assert.equal(c.body_overlap_pairs,0,c.state);assert.equal(c.top_overlap_pairs,0,c.state);assert.equal(c.bottom_overlap_pairs,0,c.state)
    assert.equal(c.introduced_self_pairs,0,c.state);assert.ok(c.self_overlap_pairs<=7,c.state);assert.equal(c.flipped_triangles,0,c.state)
  }
  assert.deepEqual(report.checks[0].weights,report.checks[4].weights)
})
