import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {Texture,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {applyBodyMorphs,BODY_MORPH_MODEL_URL,MUSCULAR_ABS_WEIGHT} from './bodyMorphs.js'
import {captureMorphWeights} from './glbGeometry.js'

const load=async url=>{
  const b=await readFile(new URL('../../../public'+url,import.meta.url))
  return (await new GLTFLoader().register(()=>({name:'TextureStub',loadTexture:()=>Promise.resolve(new Texture())})).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene
}
const mesh=scene=>{let m;scene.traverse(o=>{if(o.isMesh)m=o});return m}
const points=m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,new Vector3()).toArray())

test('23 real targets preserve the original keys; chest relief alone only reduces front depth and is reversible',async()=>{
  const old=await load('/models/ONFIT_Human_BodyMorph_v3.glb'),next=await load(BODY_MORPH_MODEL_URL)
  const a=mesh(old),b=mesh(next),names=Object.keys(b.morphTargetDictionary)
  assert.equal(names.length,23)
  for(const name of Object.keys(a.morphTargetDictionary)){
    assert.ok(names.includes(name));assert.equal(b.morphTargetInfluences[b.morphTargetDictionary[name]],a.morphTargetInfluences[a.morphTargetDictionary[name]])
  }
  assert.equal(b.morphTargetInfluences[b.morphTargetDictionary.body_build_muscular],0)
  b.morphTargetInfluences[b.morphTargetDictionary.body_abdomen_relief]=0
  const original=points(a),corrected=points(b)
  let reduction=0
  for(let i=0;i<original.length;i++){
    assert.equal(corrected[i][0],original[i][0]);assert.equal(corrected[i][1],original[i][1])
    assert.ok(corrected[i][2]<=original[i][2]+1e-7)
    reduction=Math.max(reduction,original[i][2]-corrected[i][2])
  }
  assert.ok(reduction>.011&&reduction<.0121)
  assert.equal(b.morphTargetInfluences[b.morphTargetDictionary.body_chest_relief],1)
  b.morphTargetInfluences[b.morphTargetDictionary.body_chest_relief]=0
  assert.deepEqual(points(b),original)
})

test('baseline abdomen is flatter than v3, while additional protrusion remains independent and functional',async()=>{
  const old=mesh(await load('/models/ONFIT_Human_BodyBuild_v3.glb')),scene=await load(BODY_MORPH_MODEL_URL),m=mesh(scene),defaults=captureMorphWeights(scene)
  const before=points(old)
  applyBodyMorphs(scene,defaults,{abdomen_protrusion_m:0},BODY_MORPH_MODEL_URL,'average')
  const flat=points(m)
  let reduction=0
  before.forEach((p,i)=>{if(Math.abs(p[0])<.16&&p[1]>.9&&p[1]<1.18&&p[2]>.03)reduction=Math.max(reduction,p[2]-flat[i][2])})
  assert.ok(reduction>.025&&reduction<.045)
  assert.equal(m.morphTargetInfluences[m.morphTargetDictionary.body_abdomen_relief],1)
  applyBodyMorphs(scene,defaults,{abdomen_protrusion_m:.2},BODY_MORPH_MODEL_URL,'average')
  assert.ok(points(m).some((p,i)=>p[2]-flat[i][2]>.01))
  assert.equal(m.morphTargetInfluences[m.morphTargetDictionary.body_abdomen_relief],1)
})

test('six abdominal lobes move real vertices only for muscular build; other builds restore no abs detail',async()=>{
  const scene=await load(BODY_MORPH_MODEL_URL),m=mesh(scene),defaults=captureMorphWeights(scene)
  applyBodyMorphs(scene,defaults,{},BODY_MORPH_MODEL_URL,'muscular')
  const index=m.morphTargetDictionary.body_abdominal_definition
  assert.equal(m.morphTargetInfluences[index],MUSCULAR_ABS_WEIGHT)
  const sculpted=points(m)
  m.morphTargetInfluences[index]=0;const neutral=points(m)
  let outward=0,inward=0
  for(let i=0;i<neutral.length;i++){
    assert.equal(sculpted[i][0],neutral[i][0]);assert.equal(sculpted[i][1],neutral[i][1])
    outward=Math.max(outward,sculpted[i][2]-neutral[i][2]);inward=Math.min(inward,sculpted[i][2]-neutral[i][2])
  }
  assert.ok(outward>.004*MUSCULAR_ABS_WEIGHT);assert.ok(inward<-.0002*MUSCULAR_ABS_WEIGHT)
  for(const x of [-.041,.041])for(const y of [1.065,1.115,1.165]){
    const peak=Math.max(...neutral.map((p,i)=>Math.abs(p[0]-x)<.02&&Math.abs(p[1]-y)<.02?sculpted[i][2]-p[2]:0))
    assert.ok(peak>.002*MUSCULAR_ABS_WEIGHT,`abdominal lobe ${x}/${y}`)
  }
  for(const build of ['average','slim']){applyBodyMorphs(scene,defaults,{},BODY_MORPH_MODEL_URL,build);assert.equal(m.morphTargetInfluences[index],0)}
})

test('muscle revision reduces chest projection while changing actual abdominal and limb surfaces',async()=>{
  const before=await load('/models/ONFIT_Human_BodyBuild_v2.glb'),after=await load(BODY_MORPH_MODEL_URL)
  const a=mesh(before),b=mesh(after)
  a.morphTargetInfluences[a.morphTargetDictionary.body_build_muscular]=1
  b.morphTargetInfluences[b.morphTargetDictionary.body_build_muscular]=1
  const old=points(a),next=points(b)
  let chest=0,abdomen=0,arm=0,calf=0
  old.forEach((p,i)=>{
    const distance=Math.hypot(...p.map((v,j)=>v-next[i][j]))
    if(Math.abs(p[0])<.15&&p[1]>1.17&&p[1]<1.34&&p[2]>.03)chest=Math.max(chest,p[2]-next[i][2])
    if(Math.abs(p[0])<.14&&p[1]>.98&&p[1]<1.15&&p[2]>.03)abdomen=Math.max(abdomen,distance)
    if(Math.abs(p[0])>.2&&p[1]>1.05)arm=Math.max(arm,distance)
    if(p[1]>.16&&p[1]<.45)calf=Math.max(calf,distance)
  })
  assert.ok(chest>.01);assert.ok(abdomen>.001);assert.ok(arm>.001);assert.ok(calf>.001)
})
test('same measurements produce genuinely different regional muscle geometry, not an affine body scale; average restores exactly',async()=>{
  const scene=await load(BODY_MORPH_MODEL_URL),m=mesh(scene),defaults=captureMorphWeights(scene)
  applyBodyMorphs(scene,defaults,{},BODY_MORPH_MODEL_URL,'average');const average=points(m)
  applyBodyMorphs(scene,defaults,{},BODY_MORPH_MODEL_URL,'muscular');const muscular=points(m)
  applyBodyMorphs(scene,defaults,{},BODY_MORPH_MODEL_URL,'slim');const lean=points(m)
  assert.ok(average.some((p,i)=>Math.hypot(...p.map((v,j)=>v-muscular[i][j]))>.01))
  assert.ok(average.some((p,i)=>Math.hypot(...p.map((v,j)=>v-lean[i][j]))>.01))
  // Fit per-axis scale+translation. Authored deltoid/bicep/pectoral changes
  // must leave a substantial residual beyond any global size adjustment.
  let error=0
  for(let axis=0;axis<3;axis++){
    const meanA=average.reduce((sum,p)=>sum+p[axis],0)/average.length
    const meanB=muscular.reduce((sum,p)=>sum+p[axis],0)/muscular.length
    let cov=0,variance=0
    average.forEach((p,i)=>{cov+=(p[axis]-meanA)*(muscular[i][axis]-meanB);variance+=(p[axis]-meanA)**2})
    const slope=cov/variance
    average.forEach((p,i)=>{error+=(muscular[i][axis]-(meanB+slope*(p[axis]-meanA)))**2})
  }
  assert.ok(Math.sqrt(error/average.length)>.002)
  assert.ok(muscular.flat().every(Number.isFinite))
  applyBodyMorphs(scene,defaults,{},BODY_MORPH_MODEL_URL,'average');assert.deepEqual(points(m),average)
})
