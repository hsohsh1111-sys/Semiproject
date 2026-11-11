import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {Texture,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {getTopGarment,getBottomGarment,getOuterGarment,applyGarmentMorphs} from './garmentGlb.js'
import {captureMorphWeights} from './glbGeometry.js'

async function load(url){
  const b=await readFile(new URL('../../../public'+url,import.meta.url))
  const json=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString())
  const bin=28+b.readUInt32LE(12)
  const images=(json.images??[]).map(image=>{
    const view=json.bufferViews[image.bufferView]
    return createHash('sha256').update(b.subarray(bin+(view.byteOffset??0),bin+(view.byteOffset??0)+view.byteLength)).digest('hex')
  })
  const scene=(await new GLTFLoader().register(()=>({name:'TextureStub',loadTexture:()=>Promise.resolve(new Texture())}))
    .parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene
  let mesh;scene.traverse(o=>{if(o.isMesh)mesh=o})
  return {scene,mesh,images}
}
const points=m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,new Vector3()).toArray())
const cases=[
  ...['short_sleeve','long_sleeve','hooded_jacket'].map(kind=>[kind,getTopGarment(kind),getTopGarment(kind,'female')]),
  ['pants',getBottomGarment('test'),getBottomGarment('female')],
  ['outer',getOuterGarment('test'),getOuterGarment('female')],
]
for(const [name,source,target] of cases){
  test(`${name}: dedicated female geometry preserves topology, UVs, embedded images and morph defaults`,async()=>{
    assert.notEqual(source.url,target.url)
    assert.deepEqual(target.scale,source.scale)
    assert.deepEqual(target.position,source.position)
    const a=await load(source.url),b=await load(target.url)
    assert.equal(b.mesh.geometry.attributes.position.count,a.mesh.geometry.attributes.position.count)
    assert.deepEqual(Array.from(b.mesh.geometry.index.array),Array.from(a.mesh.geometry.index.array))
    assert.deepEqual(Array.from(b.mesh.geometry.attributes.uv.array),Array.from(a.mesh.geometry.attributes.uv.array))
    assert.deepEqual(b.images,a.images)
    assert.deepEqual(b.mesh.morphTargetDictionary,a.mesh.morphTargetDictionary)
    assert.deepEqual(b.mesh.morphTargetInfluences,a.mesh.morphTargetInfluences)
    const pa=points(a.mesh),pb=points(b.mesh)
    assert.ok(pb.every(p=>p.every(Number.isFinite)))
    assert.ok(pb.some((p,i)=>Math.hypot(...p.map((v,k)=>v-pa[i][k]))>.003))
    const seams=new Map(),basis=a.mesh.geometry.attributes.position
    for(let i=0;i<pa.length;i++){
      const key=[basis.getX(i),basis.getY(i),basis.getZ(i)].map(v=>v.toFixed(6)).join(',')
      const delta=pb[i].map((v,k)=>v-pa[i][k]),previous=seams.get(key)
      if(previous)assert.ok(Math.hypot(...delta.map((v,k)=>v-previous[k]))<2e-6,'refit must not open a new UV seam')
      else seams.set(key,delta)
    }
  })
  test(`${name}: actual regional/build morphs move vertices in both directions and restore`,async()=>{
    const {scene,mesh}=await load(target.url),defaults=captureMorphWeights(scene),original=points(mesh)
    const region=name==='pants'?'hip_volume':'chest_volume'
    applyGarmentMorphs(scene,defaults,{[region]:1},target.url);const positive=points(mesh)
    applyGarmentMorphs(scene,defaults,{[region]:-1},target.url);const negative=points(mesh)
    assert.notDeepEqual(positive,original);assert.notDeepEqual(negative,original)
    for(let i=0;i<original.length;i++)for(let k=0;k<3;k++)
      assert.ok(Math.abs(positive[i][k]+negative[i][k]-2*original[i][k])<1e-6)
    applyGarmentMorphs(scene,defaults,{build_lean:1},target.url)
    assert.notDeepEqual(points(mesh),original)
    applyGarmentMorphs(scene,defaults,{build_muscular:1},target.url)
    assert.notDeepEqual(points(mesh),original)
    const compound=name==='pants'?{waist_width:.2,pelvis_width:-1,hip_volume:.5,thigh_girth:.4}:
      {shoulder_width:.2,chest_volume:.3,waist_width:-.2,abdomen_front:.8,pelvis_width:-1}
    applyGarmentMorphs(scene,defaults,compound,target.url)
    for(const [key,value] of Object.entries(compound))
      assert.equal(mesh.morphTargetInfluences[mesh.morphTargetDictionary['garment_'+key]],value)
    assert.ok(points(mesh).every(p=>p.every(Number.isFinite)))
    applyGarmentMorphs(scene,defaults,{},target.url)
    assert.deepEqual(points(mesh),original)
  })
}
