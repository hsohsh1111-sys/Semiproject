import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { applyGarmentMorphs, TSHIRT_MORPH_GLB } from './garmentGlb.js'
import { bodyMorphWeights, applyBodyMorphs, BODY_MORPH_MODEL_URL } from './bodyMorphs.js'
import { captureMorphWeights } from './glbGeometry.js'
import { createGarmentAppearance, GARMENT_COLORS } from './garmentAppearance.js'

const folder=new URL('../../../public/models/',import.meta.url)
const read=name=>readFile(new URL(name,folder))
async function load(name){const b=await read(name);return new GLTFLoader().register(()=>({name:'NodeTextureDecodeStub',loadTexture:()=>Promise.resolve(new Texture())})).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')}
const garment=await load('ONFIT_TShirt_BodyMorph_v3.glb'),old=await load('ONFIT_TShirt_BodyMorph_v2.glb'),body=await load('ONFIT_Human_BodyMorph_v2.glb')
const report=JSON.parse(await read('ONFIT_TShirt_BodyMorph_v3.json'))
const getMesh=scene=>{let m;scene.traverse(o=>{if(o.isMesh)m=o});return m}
const coords=m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,new Vector3()).toArray())
const near=(a,b)=>assert.ok(Math.abs(a-b)<2e-6,`${a} != ${b}`)
const neutral={shoulder_width_m:.42,chest_radius_m:.95/(2*Math.PI),waist_radius_m:.80/(2*Math.PI),abdomen_protrusion_m:0,pelvis_width_m:.30}
const fields=[['shoulder_width_m','shoulder_width',.25,.65],['chest_radius_m','chest_volume',.55/(2*Math.PI),1.80/(2*Math.PI)],['waist_radius_m','waist_width',.45/(2*Math.PI),1.80/(2*Math.PI)]]
function setup(){const scene=garment.scene.clone(true),m=getMesh(scene),defaults=captureMorphWeights(scene);return{scene,m,apply:p=>applyGarmentMorphs(scene,defaults,bodyMorphWeights(p),TSHIRT_MORPH_GLB.url)}}

test('v3 has five zero-weight targets and preserves ALL v2 binary data, including original two morphs and textures',async()=>{
  assert.equal(TSHIRT_MORPH_GLB.url,'/models/ONFIT_TShirt_BodyMorph_v5.glb')
  const m=getMesh(garment.scene),before=getMesh(old.scene)
  assert.deepEqual(Object.keys(m.morphTargetDictionary),['garment_abdomen_front','garment_pelvis_width','garment_shoulder_width','garment_chest_volume','garment_waist_width'])
  assert.deepEqual(m.morphTargetInfluences,[0,0,0,0,0])
  for(const attr of ['position','uv','normal'])assert.deepEqual(m.geometry.attributes[attr].array,before.geometry.attributes[attr].array)
  assert.deepEqual(m.geometry.index.array,before.geometry.index.array)
  const extract=b=>{const n=b.readUInt32LE(12);return b.subarray(28+n,28+n+b.readUInt32LE(20+n))}
  const a=extract(await read('ONFIT_TShirt_BodyMorph_v2.glb')),b=extract(await read('ONFIT_TShirt_BodyMorph_v3.glb'))
  assert.ok(b.subarray(0,a.length).equals(a))
  for(const [path,hash]of Object.entries(report.source_hashes))assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),hash)
})

for(const [field,name,min,max]of fields)test(`${name} supports real negative/positive Three.js vertex deformation and restores baseline`,()=>{
  const {m,apply}=setup();apply(neutral);const base=coords(m)
  apply({...neutral,[field]:min});const minus=coords(m)
  assert.equal(m.morphTargetInfluences[m.morphTargetDictionary['garment_'+name]],-1)
  apply({...neutral,[field]:max});const plus=coords(m)
  assert.equal(m.morphTargetInfluences[m.morphTargetDictionary['garment_'+name]],1)
  let changed=0
  base.forEach((p,i)=>{
    if(Math.hypot(...plus[i].map((v,a)=>v-p[a]))>1e-6)changed++
    p.forEach((v,a)=>near(minus[i][a]-v,-(plus[i][a]-v)))
  })
  assert.ok(changed>100)
  for(const other of ['abdomen_front','pelvis_width',...fields.map(f=>f[1])])if(other!==name)near(m.morphTargetInfluences[m.morphTargetDictionary['garment_'+other]],0)
  apply(neutral);assert.deepEqual(coords(m),base)
})

test('all five garment/body weights match; corner collision checks and four colors pass without mutating cached models',()=>{
  const {scene,m,apply}=setup(),human=body.scene.clone(true),h=getMesh(human),defaults=captureMorphWeights(human)
  const p={shoulder_width_m:.65,chest_radius_m:1.80/(2*Math.PI),waist_radius_m:.45/(2*Math.PI),abdomen_protrusion_m:.20,pelvis_width_m:.20}
  const appearance=createGarmentAppearance(scene),map=m.material.map,normal=m.material.normalMap
  for(const color of GARMENT_COLORS){
    appearance.setColor(color.id);apply(p);applyBodyMorphs(human,defaults,p,BODY_MORPH_MODEL_URL)
    for(const name of Object.keys(bodyMorphWeights(p))) {
      const index=m.morphTargetDictionary['garment_'+name]
      if(index!==undefined) near(m.morphTargetInfluences[index],h.morphTargetInfluences[h.morphTargetDictionary[name]])
    }
    assert.equal(m.material.map,map);assert.equal(m.material.normalMap,normal)
  }
  assert.equal(report.checks.length,45)
  for(const c of report.checks){assert.equal(c.body_overlap_pairs,0);assert.equal(c.self_overlap_pairs,0);assert.equal(c.flipped_triangles,0);assert.ok(c.min_gap_m>.003)}
  appearance.dispose();assert.deepEqual(getMesh(garment.scene).morphTargetInfluences,[0,0,0,0,0])
})
