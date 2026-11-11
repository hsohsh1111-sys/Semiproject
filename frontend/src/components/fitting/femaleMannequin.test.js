import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {Texture, Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {BODY_MORPH_MODEL_URL, FEMALE_BODY_MODEL_URL, applyBodyMorphs} from './bodyMorphs.js'
import {captureMorphWeights} from './glbGeometry.js'
import {getTopGarment} from './garmentGlb.js'

async function load(url) {
  const bytes = await readFile(new URL('../../../public'+url, import.meta.url))
  return (await new GLTFLoader().register(()=>({name:'TextureStub',loadTexture:()=>Promise.resolve(new Texture())}))
    .parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength), '')).scene
}
function mesh(scene) { let result; scene.traverse(o=>{if(o.isMesh)result=o});return result }
const points = m => Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,new Vector3()).toArray())

test('female GLB uses real female MPFB defaults and distinct geometry, preserving topology and original targets',async()=>{
  const a=mesh(await load(BODY_MORPH_MODEL_URL)),b=mesh(await load(FEMALE_BODY_MODEL_URL))
  assert.equal(b.geometry.attributes.position.count,a.geometry.attributes.position.count)
  assert.equal(Object.keys(b.morphTargetDictionary).length,23)
  for(const name of Object.keys(a.morphTargetDictionary))assert.ok(name in b.morphTargetDictionary)
  for(const race of ['as','ca','af']){
    assert.equal(b.morphTargetInfluences[b.morphTargetDictionary[`$md-$${race}-$ma-$yn`]],0)
    assert.ok(b.morphTargetInfluences[b.morphTargetDictionary[`$md-$${race}-$fe-$yn`]]>.3)
  }
  const pa=points(a),pb=points(b)
  assert.ok(pb.every(p=>p.every(Number.isFinite)))
  assert.ok(pb.some((p,i)=>Math.hypot(...p.map((v,k)=>v-pa[i][k]))>.01))
  assert.deepEqual(Array.from(b.geometry.index.array),Array.from(a.geometry.index.array))
})

test('female abdomen and pelvis remain independent, builds change vertices and defaults restore exactly',async()=>{
  const scene=await load(FEMALE_BODY_MODEL_URL),m=mesh(scene),defaults=captureMorphWeights(scene)
  applyBodyMorphs(scene,defaults,{},FEMALE_BODY_MODEL_URL)
  const original=points(m),base=m.morphTargetInfluences.slice()
  const result=applyBodyMorphs(scene,defaults,{abdomen_protrusion_m:.2,pelvis_width_m:.2},FEMALE_BODY_MODEL_URL)
  assert.equal(result.supported.length,7)
  assert.equal(m.morphTargetInfluences[m.morphTargetDictionary.abdomen_front],.8)
  assert.equal(m.morphTargetInfluences[m.morphTargetDictionary.pelvis_width],-1)
  for(const name of ['shoulder_width','chest_volume','waist_width','hip_volume','thigh_girth'])
    assert.equal(m.morphTargetInfluences[m.morphTargetDictionary[name]],base[m.morphTargetDictionary[name]])
  assert.notDeepEqual(points(m),original)
  for(const build of ['slim','muscular']){
    applyBodyMorphs(scene,defaults,{},FEMALE_BODY_MODEL_URL,build)
    assert.notDeepEqual(points(m),original)
    assert.ok(points(m).every(p=>p.every(Number.isFinite)))
    assert.equal(m.morphTargetInfluences[m.morphTargetDictionary.body_abdominal_definition],0)
  }
  applyBodyMorphs(scene,defaults,{},FEMALE_BODY_MODEL_URL)
  assert.deepEqual(points(m),original)
  assert.deepEqual(m.morphTargetInfluences,base)
})

test('female top selection uses dedicated refitted garments without changing original templates',()=>{
  for(const kind of ['short_sleeve','long_sleeve','hooded_jacket'])
    assert.notEqual(getTopGarment(kind,'female').url,getTopGarment(kind,'test').url)
})

test('female chest revision increases local volume with a lower-chest transition, preserving lower body, limbs and topology',async()=>{
  const before=mesh(await load('/models/ONFIT_Human_Female_v1.glb'))
  const after=mesh(await load(FEMALE_BODY_MODEL_URL))
  const a=points(before),b=points(after)
  assert.deepEqual(after.morphTargetDictionary,before.morphTargetDictionary)
  assert.deepEqual(Array.from(after.geometry.attributes.position.array),Array.from(before.geometry.attributes.position.array))
  let increase=0,changed=0
  for(let i=0;i<a.length;i++){
    const delta=b[i].map((v,k)=>v-a[i][k])
    if(a[i][1]<1.0||a[i][1]>1.45||Math.abs(a[i][0])>.24)assert.ok(Math.hypot(...delta)<1e-7)
    if(delta[2]>.0001)changed++
    increase=Math.max(increase,delta[2])
  }
  assert.ok(changed>50)
  assert.ok(increase>.005&&increase<.04,`local forward increase ${increase}m`)
  assert.equal(after.morphTargetInfluences[after.morphTargetDictionary.body_chest_relief],.5)
})
