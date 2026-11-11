import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { applyBodyMorphs, bodyMorphWeights, BODY_MORPH_MODEL_URL } from './bodyMorphs.js'
import { captureMorphWeights } from './glbGeometry.js'

const folder=new URL('../../../public/models/',import.meta.url)
const read=name=>readFile(new URL(name,folder))
async function load(name) { const b=await read(name); return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'') }
const asset=await load('ONFIT_Human_BodyMorph_v2.glb'), old=await load('ONFIT_Human_BodyMorph_v1.glb')
const report=JSON.parse(await read('ONFIT_Human_BodyMorph_v2.json'))
function mesh(scene) {let m; scene.traverse(o=>{if(o.isMesh)m=o});return m}
const coords=m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,new Vector3()).toArray())
const reference={shoulder_width_m:.42,chest_radius_m:.95/(2*Math.PI),waist_radius_m:.80/(2*Math.PI),abdomen_protrusion_m:0,pelvis_width_m:.30}
const fields=[['shoulder_width_m','shoulder_width',.25,.65],['chest_radius_m','chest_volume',.55/(2*Math.PI),1.80/(2*Math.PI)],['waist_radius_m','waist_width',.45/(2*Math.PI),1.80/(2*Math.PI)]]
function setup() { const scene=asset.scene.clone(true),m=mesh(scene),defaults=captureMorphWeights(scene);return{scene,m,apply:p=>applyBodyMorphs(scene,defaults,p,BODY_MORPH_MODEL_URL)} }
const near=(a,b)=>assert.ok(Math.abs(a-b)<2e-6,`${a} != ${b}`)

test('v2 has 16 targets, exact original vertex/index/UV layout and 13 original morphs/default weights',async()=>{
  const m=mesh(asset.scene),before=mesh(old.scene)
  assert.equal(Object.keys(m.morphTargetDictionary).length,16)
  for(const field of ['position','uv']) assert.deepEqual(m.geometry.attributes[field].array,before.geometry.attributes[field].array)
  assert.deepEqual(m.geometry.index.array,before.geometry.index.array)
  for(const [name,index] of Object.entries(before.morphTargetDictionary)){
    const current=m.morphTargetDictionary[name]
    assert.equal(m.morphTargetInfluences[current],before.morphTargetInfluences[index])
    assert.deepEqual(m.geometry.morphAttributes.position[current].array,before.geometry.morphAttributes.position[index].array)
  }
  fields.forEach(([,key])=>assert.equal(m.morphTargetInfluences[m.morphTargetDictionary[key]],0))
  assert.equal(createHash('sha256').update(await read('ONFIT_Human_BodyMorph_v2.glb')).digest('hex'),report.glb_sha256)
  assert.equal(createHash('sha256').update(await readFile(report.source)).digest('hex'),report.source_sha256)
})

for(const [field,key,min,max] of fields) test(`${key}: signed independent mapping, real vertex change and exact restore`,()=>{
  const {m,apply}=setup();apply(reference);const base=coords(m)
  apply({...reference,[field]:max});const plus=coords(m)
  near(m.morphTargetInfluences[m.morphTargetDictionary[key]],1)
  apply({...reference,[field]:min});const minus=coords(m)
  near(m.morphTargetInfluences[m.morphTargetDictionary[key]],-1)
  let changed=0
  base.forEach((p,i)=>{
    const d=plus[i].map((x,a)=>x-p[a]);if(Math.hypot(...d)>1e-6)changed++
    p.forEach((x,a)=>near(minus[i][a]-x,-d[a]))
    if(key!=='chest_volume') {near(plus[i][1],p[1]);near(plus[i][2],p[2])}
    if(key==='chest_volume' && (p[1]<1.13 || p[1]>1.36)) p.forEach((x,a)=>near(plus[i][a],x))
    if(key==='waist_width' && (p[1]<.98 || p[1]>1.18)) p.forEach((x,a)=>near(plus[i][a],x))
  })
  assert.ok(changed>100)
  for(const [otherField,other] of fields) if(otherField!==field) near(m.morphTargetInfluences[m.morphTargetDictionary[other]],0)
  near(m.morphTargetInfluences[m.morphTargetDictionary.abdomen_front],0)
  near(m.morphTargetInfluences[m.morphTargetDictionary.pelvis_width],0)
  apply(reference);assert.deepEqual(coords(m),base)
})

test('five keys combine additively, preserve MPFB weights and cached scene; checked corners have no new crossings',()=>{
  const {m,apply}=setup();apply(reference);const base=coords(m)
  const parameters={...reference,shoulder_width_m:.65,chest_radius_m:1.80/(2*Math.PI),waist_radius_m:.45/(2*Math.PI),abdomen_protrusion_m:.2,pelvis_width_m:.2}
  const weights=bodyMorphWeights(parameters);apply(parameters);const combined=coords(m)
  base.forEach((p,i)=>p.forEach((x,a)=>{
    let expected=x
    for(const [key,weight] of Object.entries(weights)) {
      const target=m.morphTargetDictionary[key]
      if(target!==undefined) expected+=weight*m.geometry.morphAttributes.position[target].getComponent(i,a)
    }
    near(combined[i][a],expected)
  }))
  assert.equal(report.restored_exactly,true)
  assert.ok(report.checks.length>=40)
  report.checks.forEach(c=>{assert.equal(c.flipped_triangles,0);if(c.weights)assert.equal(c.introduced_self_intersections,0)})
  assert.deepEqual(mesh(asset.scene).morphTargetInfluences,mesh(old.scene).morphTargetInfluences.concat([0,0,0]))
  apply(reference);assert.deepEqual(coords(m),base)
})
