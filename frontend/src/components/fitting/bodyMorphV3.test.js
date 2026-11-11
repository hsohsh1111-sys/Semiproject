import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { applyBodyMorphs, bodyMorphWeights, BODY_MORPH_MODEL_URL } from './bodyMorphs.js'
import { applyGarmentMorphs, TSHIRT_MORPH_GLB } from './garmentGlb.js'
import { captureMorphWeights } from './glbGeometry.js'

const folder=new URL('../../../public/models/',import.meta.url)
const read=name=>readFile(new URL(name,folder))
async function load(name){const b=await read(name);return new GLTFLoader().register(()=>({name:'NodeTextureDecodeStub',loadTexture:()=>Promise.resolve(new Texture())})).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')}
const asset=await load('ONFIT_Human_BodyMorph_v3.glb'),previous=await load('ONFIT_Human_BodyMorph_v2.glb')
const garment=await load('ONFIT_TShirt_BodyMorph_v3.glb')
const report=JSON.parse(await read('ONFIT_Human_BodyMorph_v3.json'))
function mesh(scene){let m;scene.traverse(o=>{if(o.isMesh)m=o});return m}
const coords=m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,new Vector3()).toArray())
const neutral={shoulder_width_m:.42,chest_radius_m:.95/(2*Math.PI),waist_radius_m:.80/(2*Math.PI),abdomen_protrusion_m:0,pelvis_width_m:.30,hip_radius_m:.95/(2*Math.PI),thigh_radius_m:.50/(2*Math.PI)}
const fields=[['hip_radius_m','hip_volume',.55/(2*Math.PI),1.80/(2*Math.PI)],['thigh_radius_m','thigh_girth',.25/(2*Math.PI),1/(2*Math.PI)]]
const near=(a,b)=>assert.ok(Math.abs(a-b)<2e-6,`${a} != ${b}`)
function setup(){const scene=asset.scene.clone(true),m=mesh(scene),defaults=captureMorphWeights(scene);return{scene,m,apply:p=>applyBodyMorphs(scene,defaults,p,BODY_MORPH_MODEL_URL)}}

test('v3 has 18 targets, exact original geometry/index/UV order, original 16 morph arrays and weights',async()=>{
  const m=mesh(asset.scene),old=mesh(previous.scene)
  assert.equal(Object.keys(m.morphTargetDictionary).length,18)
  for(const key of ['position','uv','normal'])assert.deepEqual(m.geometry.attributes[key].array,old.geometry.attributes[key].array)
  assert.deepEqual(m.geometry.index.array,old.geometry.index.array)
  for(const [name,i]of Object.entries(old.morphTargetDictionary)){
    const j=m.morphTargetDictionary[name]
    assert.equal(m.morphTargetInfluences[j],old.morphTargetInfluences[i])
    assert.deepEqual(m.geometry.morphAttributes.position[j].array,old.geometry.morphAttributes.position[i].array)
  }
  for(const name of ['hip_volume','thigh_girth'])assert.equal(m.morphTargetInfluences[m.morphTargetDictionary[name]],0)
  assert.equal(createHash('sha256').update(await read('ONFIT_Human_BodyMorph_v3.glb')).digest('hex'),report.glb_sha256)
  assert.equal(createHash('sha256').update(await readFile(report.source)).digest('hex'),report.source_sha256)
})

for(const [field,key,min,max]of fields)test(`${key} supports signed independent deformation, symmetric sides and exact baseline restoration`,()=>{
  const {m,apply}=setup();apply(neutral);const base=coords(m)
  apply({...neutral,[field]:max});const plus=coords(m)
  near(m.morphTargetInfluences[m.morphTargetDictionary[key]],1)
  apply({...neutral,[field]:min});const minus=coords(m)
  near(m.morphTargetInfluences[m.morphTargetDictionary[key]],-1)
  let count=0,left=0,right=0
  base.forEach((p,i)=>{
    const d=plus[i].map((v,a)=>v-p[a])
    if(Math.hypot(...d)>1e-6)count++
    p.forEach((v,a)=>near(minus[i][a]-v,-d[a]))
    near(d[1],0) // Never change vertical leg length.
    if(key==='hip_volume'){
      near(d[0],0) // Independent from lateral pelvis width.
      if(p[2]>=.005 || p[1]<.775 || p[1]>.98)p.forEach((v,a)=>near(plus[i][a],v))
      assert.ok(d[2]<=2e-6) // Posterior, never additional anterior abdomen.
    }else{
      if(p[1]<.43 || p[1]>.76)p.forEach((v,a)=>near(plus[i][a],v))
      if(Math.abs(p[0])>.00001)assert.equal(Math.sign(plus[i][0]),Math.sign(p[0]))
      left=Math.min(left,d[0]);right=Math.max(right,d[0])
    }
  })
  assert.ok(count>100)
  if(key==='thigh_girth')near(left,-right)
  for(const [other,index]of Object.entries(m.morphTargetDictionary))if(['shoulder_width','chest_volume','waist_width','abdomen_front','pelvis_width','hip_volume','thigh_girth'].includes(other)&&other!==key)near(m.morphTargetInfluences[index],0)
  apply(neutral);assert.deepEqual(coords(m),base)
})

test('requested lower-body combinations stay additive and preserve upper-body weights and cached asset',()=>{
  const {m,apply}=setup();apply(neutral);const base=coords(m)
  for(const p of [
    {...neutral,hip_radius_m:1.80/(2*Math.PI),thigh_radius_m:1/(2*Math.PI)},
    {...neutral,pelvis_width_m:.20,hip_radius_m:1.80/(2*Math.PI)},
    {...neutral,abdomen_protrusion_m:.20,hip_radius_m:.55/(2*Math.PI)},
  ]){
    const weights=bodyMorphWeights(p);apply(p);const points=coords(m)
    base.forEach((v,i)=>v.forEach((x,a)=>{
      let expected=x
      for(const [key,weight]of Object.entries(weights))expected+=weight*m.geometry.morphAttributes.position[m.morphTargetDictionary[key]].getComponent(i,a)
      near(points[i][a],expected)
    }))
  }
  apply(neutral);assert.deepEqual(coords(m),base)
  assert.ok(report.checks.length>=30)
  for(const c of report.checks){assert.equal(c.flipped_triangles,0);if('introduced_self_intersections'in c)assert.equal(c.introduced_self_intersections,0)}
  assert.equal(report.restored_exactly,true)
  assert.deepEqual(mesh(asset.scene).morphTargetInfluences,mesh(previous.scene).morphTargetInfluences.concat([0,0]))
})

test('new lower-body parameters do not invent garment morphs or change the existing five garment weights',()=>{
  const scene=garment.scene.clone(true),m=mesh(scene),defaults=captureMorphWeights(scene)
  const p={...neutral,abdomen_protrusion_m:.20,pelvis_width_m:.20,shoulder_width_m:.65}
  applyGarmentMorphs(scene,defaults,bodyMorphWeights(p),TSHIRT_MORPH_GLB.url)
  const before=coords(m),weights=m.morphTargetInfluences.slice()
  applyGarmentMorphs(scene,defaults,bodyMorphWeights({...p,hip_radius_m:1.80/(2*Math.PI),thigh_radius_m:1/(2*Math.PI)}),TSHIRT_MORPH_GLB.url)
  assert.deepEqual(m.morphTargetInfluences,weights);assert.deepEqual(coords(m),before)
  assert.equal(m.morphTargetDictionary.garment_hip_volume,undefined)
  assert.equal(m.morphTargetDictionary.garment_thigh_girth,undefined)
})
