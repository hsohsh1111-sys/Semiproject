import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {Texture,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {getTopGarment,getBottomGarment,FEMALE_SKIRT_GLB,applyGarmentMorphs} from './garmentGlb.js'
import {captureMorphWeights} from './glbGeometry.js'
async function load(url){
  const b=await readFile(new URL('../../../public'+url,import.meta.url))
  const scene=(await new GLTFLoader().register(()=>({name:'TextureStub',loadTexture:()=>Promise.resolve(new Texture())}))
    .parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene
  let mesh;scene.traverse(o=>{if(o.isMesh)mesh=o});return {scene,mesh}
}
const points=m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,new Vector3()).toArray())
for(const [kind,stem] of [['short_sleeve','TShirt'],['long_sleeve','LongSleeve']]){
  test(`${kind}: female default abdomen front is reduced while chest, sleeves and UV remain`,async()=>{
    const a=(await load(`/models/ONFIT_${stem}_Female_v5.glb`)).mesh
    const b=(await load(getTopGarment(kind,'female').url)).mesh
    assert.deepEqual(Array.from(a.geometry.attributes.uv.array),Array.from(b.geometry.attributes.uv.array))
    assert.deepEqual(Array.from(a.geometry.index.array),Array.from(b.geometry.index.array))
    const pa=points(a),pb=points(b);let inward=0,changed=0
    for(let i=0;i<pa.length;i++){
      const delta=pb[i].map((v,k)=>v-pa[i][k])
      if(pa[i][1]>1.18)assert.ok(Math.hypot(...delta)<.00002,'chest transition drift must stay below 0.02mm')
      if(Math.abs(pa[i][0])>.30)assert.ok(Math.hypot(...delta)<2e-6)
      inward=Math.max(inward,-delta[2]);if(delta[2]<-.001)changed++
    }
    assert.ok(inward>.003&&inward<.031,`inward displacement ${inward}`)
    assert.ok(changed>20)
  })
}
test('actual MPFB skirt contains finite knee-length geometry, texture, six real targets and source license',async()=>{
  const {mesh}=await load(FEMALE_SKIRT_GLB.url),p=points(mesh)
  assert.ok(p.length>500&&p.every(v=>v.every(Number.isFinite)))
  assert.ok(Math.min(...p.map(v=>v[1]))>.35&&Math.max(...p.map(v=>v[1]))<1.05)
  assert.equal(Object.keys(mesh.morphTargetDictionary).length,6)
  assert.ok(mesh.material.map)
  const source=JSON.parse(await readFile(new URL('../../../public'+FEMALE_SKIRT_GLB.url.replace('.glb','.json'),import.meta.url),'utf8'))
  assert.equal(source.license,'CC0');assert.match(source.asset_name,/female_elegantsuit01/)
})
test('skirt receives independent waist/pelvis/hip/abdomen plus female builds; defaults restore',async()=>{
  const {scene,mesh}=await load(FEMALE_SKIRT_GLB.url),defaults=captureMorphWeights(scene),base=points(mesh)
  for(const value of [-1,1]){
    applyGarmentMorphs(scene,defaults,{hip_volume:value},FEMALE_SKIRT_GLB.url)
    assert.notDeepEqual(points(mesh),base)
  }
  const weights={waist_width:-.3,pelvis_width:-1,hip_volume:.6,abdomen_front:.8,build_muscular:1}
  applyGarmentMorphs(scene,defaults,weights,FEMALE_SKIRT_GLB.url)
  for(const [name,value] of Object.entries(weights))assert.equal(mesh.morphTargetInfluences[mesh.morphTargetDictionary['garment_'+name]],value)
  assert.ok(points(mesh).every(p=>p.every(Number.isFinite)))
  applyGarmentMorphs(scene,defaults,{},FEMALE_SKIRT_GLB.url);assert.deepEqual(points(mesh),base)
})
test('pants/skirt share one bottom slot and male/default model never loads female skirt',()=>{
  assert.equal(getBottomGarment('female','skirt'),FEMALE_SKIRT_GLB)
  assert.notEqual(getBottomGarment('female','pants').url,FEMALE_SKIRT_GLB.url)
  assert.notEqual(getBottomGarment('test','skirt').url,FEMALE_SKIRT_GLB.url)
  assert.equal(FEMALE_SKIRT_GLB.slot,'bottom')
})
