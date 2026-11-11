import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Texture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { HOODED_JACKET_GLB, HOODED_JACKET_MORPH_GLB, getTopGarment, loadGarmentAsset, disposeGarmentAsset, applyGarmentMorphs } from './garmentGlb.js'
import { captureMorphWeights } from './glbGeometry.js'
import { createModelAppearance } from './garmentAppearance.js'

const assets=new URL('../../../../assets/blender/',import.meta.url)
const models=new URL('../../../public/models/',import.meta.url)
const bytes=await readFile(new URL('ONFIT_HoodedJacket_v1.glb',models))
// Geometry/loader tests only: native PNG decoding and WebGL require a browser.
const loader=()=>new GLTFLoader().register(()=>({ name:'NodeTextureDecodeStub', loadTexture:()=>Promise.resolve(new Texture()) }))
const parse=b=>loader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')
const asset=await parse(bytes)
const meshes=scene=>{const result=[];scene.traverse(o=>{if(o.isMesh)result.push(o)});return result}

test('real exported hooded jacket has authored UV/material/textures and no invented morphs',()=>{
  const [mesh]=meshes(asset.scene)
  assert.equal(meshes(asset.scene).length,1)
  assert.equal(mesh.name,'ONFIT_HoodedJacket')
  assert.ok(mesh.geometry.attributes.position.count>9000)
  assert.ok(mesh.geometry.attributes.uv&&mesh.material.map&&mesh.material.normalMap)
  assert.equal(mesh.geometry.morphAttributes.position,undefined)
  assert.equal(mesh.material.metalness,0)
  assert.ok(mesh.material.roughness>=.8)
  assert.equal(mesh.material.transparent,false)
  assert.ok(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite))
})

test('local fitting preserves original triangle order and UV coordinates',async()=>{
  const initial=await parse(await readFile(new URL('hooded_jacket_drafts/ONFIT_HoodedJacket_v1.initial.glb',assets)))
  const before=meshes(initial.scene)[0],after=meshes(asset.scene)[0]
  assert.deepEqual(after.geometry.index.array,before.geometry.index.array)
  assert.deepEqual(after.geometry.attributes.uv.array,before.geometry.attributes.uv.array)
  let changed=false
  for(let i=0;i<after.geometry.attributes.position.array.length;i++) {
    if(after.geometry.attributes.position.array[i]!==before.geometry.attributes.position.array[i])changed=true
  }
  assert.ok(changed,'Authored fitting should actually change local vertex coordinates')
})

test('top selection reuses actual GLB and preserves static geometry and authored color',()=>{
  assert.equal(getTopGarment('hooded_jacket'),HOODED_JACKET_MORPH_GLB)
  assert.equal(getTopGarment('hooded_jacket','male'),HOODED_JACKET_GLB)
  assert.equal(HOODED_JACKET_GLB.slot,'top')
  assert.equal(HOODED_JACKET_GLB.supportsMorphs,false)
  assert.equal(HOODED_JACKET_GLB.supportsOuter,false)
  assert.equal(createModelAppearance(asset.scene,HOODED_JACKET_GLB),null)
  const mesh=meshes(asset.scene)[0],positions=mesh.geometry.attributes.position.array.slice(),material=mesh.material
  applyGarmentMorphs(asset.scene,captureMorphWeights(asset.scene),{shoulder_width:1,abdomen_front:.8},HOODED_JACKET_GLB.url)
  assert.deepEqual(mesh.geometry.attributes.position.array,positions)
  assert.equal(mesh.material,material)
})

test('GLB loads and unloads repeatedly through the existing production loader',async()=>{
  for(let i=0;i<2;i++){
    const result=await loadGarmentAsset(HOODED_JACKET_GLB.url,{loader:loader(),fetcher:async()=>({ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)})})
    assert.equal(meshes(result.scene).length,1)
    disposeGarmentAsset(result.asset)
  }
})

test('source inputs remain unchanged, while collision reports retain known limitations',async()=>{
  const source=JSON.parse(await readFile(new URL('ONFIT_HoodedJacket_v1.source.json',assets),'utf8'))
  const report=JSON.parse(await readFile(new URL('hood_final.validation.json',assets),'utf8'))
  const hash=b=>createHash('sha256').update(b).digest('hex')
  assert.equal(hash(bytes),source.glb_sha256)
  assert.equal(hash(await readFile(source.source_blend)),source.source_blend_sha256)
  assert.equal(hash(await readFile(source.asset)),source.asset_sha256)
  for(const [name,digest] of Object.entries(report.input_hashes))assert.equal(hash(await readFile(new URL(name,models))),digest)
  assert.equal(report.morph_targets,0)
  assert.equal(report.degenerate_triangles,0)
  assert.equal(report.browser_verified,false)
  assert.ok(report.checks.body.overlap_pairs>0)
  assert.ok(report.checks.outer.overlap_pairs>0,'Existing padded jacket combination is not approved')
  const attribution=await readFile(new URL('ONFIT_HoodedJacket_LICENSE.txt',models),'utf8')
  assert.match(attribution,/Elvaerwyn/);assert.match(attribution,/CC BY/)
})
