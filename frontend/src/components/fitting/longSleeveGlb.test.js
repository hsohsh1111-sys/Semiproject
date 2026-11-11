import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Group, Texture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { LONG_SLEEVE_GLB, LONG_SLEEVE_MORPH_GLB, TSHIRT_GLB, TSHIRT_MORPH_GLB, getTopGarment, PANTS_GLB, OUTER_GLB, applyGarmentMorphs, loadGarmentAsset, disposeGarmentAsset } from './garmentGlb.js'
import { captureMorphWeights, preciseBounds, modelLayout } from './glbGeometry.js'
import { createModelAppearance, GARMENT_COLORS } from './garmentAppearance.js'

const folder=new URL('../../../public/models/',import.meta.url),assets=new URL('../../../../assets/blender/',import.meta.url)
const read=name=>readFile(new URL(name,folder))
const loader=()=>new GLTFLoader().register(()=>({name:'NodeTextureDecodeStub',loadTexture:()=>Promise.resolve(new Texture())}))
async function load(name){const b=await read(name);return loader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')}
const garment=await load('ONFIT_LongSleeve_v1.glb'),short=await load('ONFIT_TShirt_BodyMorph_v5.glb'),body=await load('ONFIT_Human_BodyMorph_v3.glb'),pants=await load('ONFIT_Pants_BodyMorph_v2.glb'),outer=await load('ONFIT_Outer_BodyMorph_v1.glb')
const source=JSON.parse(await readFile(new URL('ONFIT_LongSleeve_v1.source.json',assets),'utf8'))
const validation=JSON.parse(await readFile(new URL('long_sleeve_final.validation.json',assets),'utf8'))
const mesh=s=>{let m;s.traverse(o=>{if(o.isMesh)m=o});return m}

test('actual licensed long-sleeve GLB contains one authored textured mesh, no jeans and no morph targets',async()=>{
  assert.equal(source.asset_name,'male_casualsuit02');assert.equal(source.license,'CC0')
  const bytes=await read('ONFIT_LongSleeve_v1.glb'),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)))
  assert.equal(doc.meshes.length,1);assert.equal(doc.nodes.length,1);assert.equal(doc.nodes[0].name,'ONFIT_LongSleeve')
  const m=mesh(garment.scene)
  assert.equal(m.geometry.index.count/3,9632)
  assert.equal(m.geometry.morphAttributes.position,undefined)
  assert.ok(m.material.map&&m.material.normalMap&&m.geometry.attributes.uv)
  assert.equal(m.material.transparent,false)
  assert.equal(createHash('sha256').update(bytes).digest('hex'),source.glb_sha256)
  for(const [name,hash]of Object.entries(validation.input_hashes))assert.equal(createHash('sha256').update(await read(name)).digest('hex'),hash)
  assert.equal(createHash('sha256').update(await readFile(source.asset)).digest('hex'),source.asset_sha256)
  assert.equal(createHash('sha256').update(await readFile(source.source_blend)).digest('hex'),source.source_blend_sha256)
})

test('local fitting preserves actual asset topology, UVs, material/texture buffers and static semantics',async()=>{
  const initial=await readFile(new URL('long_sleeve_drafts/ONFIT_LongSleeve_v1.initial.glb',assets)),current=await read('ONFIT_LongSleeve_v1.glb')
  const binary=b=>{const n=b.readUInt32LE(12);return b.subarray(28+n,28+n+b.readUInt32LE(20+n))}
  assert.ok(binary(current).subarray(0,binary(initial).length).equals(binary(initial)))
  const old=await loader().parseAsync(initial.buffer.slice(initial.byteOffset,initial.byteOffset+initial.byteLength),'')
  const m=mesh(garment.scene),a=mesh(old.scene)
  assert.deepEqual(m.geometry.index.array,a.geometry.index.array)
  assert.deepEqual(m.geometry.attributes.uv.array,a.geometry.attributes.uv.array)
  assert.ok(source.local_fitting_max_m<.02)
  const positions=m.geometry.attributes.position.array.slice()
  applyGarmentMorphs(garment.scene,captureMorphWeights(garment.scene),{shoulder_width:1,abdomen_front:.8,pelvis_width:-1},LONG_SLEEVE_GLB.url)
  assert.deepEqual(m.geometry.attributes.position.array,positions)
})

test('one top slot selects short or long, preserves authored blue/logo, and leaves bottom/outer mounted independently',()=>{
  assert.equal(getTopGarment('short_sleeve'),TSHIRT_MORPH_GLB)
  assert.equal(getTopGarment('short_sleeve','male'),TSHIRT_GLB)
  assert.equal(getTopGarment('long_sleeve'),LONG_SLEEVE_MORPH_GLB)
  assert.equal(getTopGarment('long_sleeve','male'),LONG_SLEEVE_GLB)
  assert.equal(TSHIRT_MORPH_GLB.slot,LONG_SLEEVE_GLB.slot)
  assert.equal(LONG_SLEEVE_GLB.slot,'top');assert.equal(PANTS_GLB.slot,'bottom');assert.equal(OUTER_GLB.slot,'outer')
  const group=new Group(),layout=modelLayout(body.scene)
  group.scale.setScalar(layout.scale);group.position.fromArray(layout.position)
  const long=garment.scene.clone(true),tee=short.scene.clone(true),bottom=pants.scene.clone(true),coat=outer.scene.clone(true)
  group.add(bottom,coat,tee);group.updateMatrixWorld(true)
  const before=coat.matrixWorld.elements.slice()
  for(let i=0;i<3;i++){
    group.remove(tee);group.add(long);group.updateMatrixWorld(true)
    assert.ok(!group.children.includes(tee)&&group.children.includes(bottom)&&group.children.includes(coat))
    const bounds=preciseBounds(long)
    assert.ok(bounds.min.y>.7&&bounds.max.y<1.6&&bounds.max.x-bounds.min.x>.85)
    group.remove(long);group.add(tee);group.updateMatrixWorld(true)
    assert.deepEqual(coat.matrixWorld.elements,before)
  }
  const m=mesh(long),material=m.material,positions=m.geometry.attributes.position.array.slice()
  assert.equal(createModelAppearance(long,LONG_SLEEVE_GLB),null)
  const appearance=createModelAppearance(tee,TSHIRT_MORPH_GLB)
  for(const color of GARMENT_COLORS){appearance.setColor(color.id);assert.equal(m.material,material);assert.deepEqual(m.geometry.attributes.position.array,positions)}
  appearance.dispose()
})

test('long sleeve can load/unmount/reload without disposing the independently loaded coat',async()=>{
  const bytes=await read('ONFIT_LongSleeve_v1.glb');let disposed=0
  mesh(outer.scene).material.map.addEventListener('dispose',()=>disposed++)
  for(let i=0;i<2;i++){
    const result=await loadGarmentAsset(LONG_SLEEVE_GLB.url,{loader:loader(),fetcher:async()=>({ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)})})
    assert.equal(mesh(result.scene).geometry.index.count/3,9632)
    disposeGarmentAsset(result.asset);assert.equal(disposed,0)
  }
})

test('actual exported baseline reports body, jeans and jacket clearance separately and does not claim morph support',()=>{
  assert.equal(validation.morph_targets,0)
  assert.equal(validation.degenerate_triangles,0)
  assert.equal(validation.checks.body.overlap_pairs,0)
  assert.equal(validation.checks.bottom.overlap_pairs,0)
  assert.equal(validation.checks.outer.overlap_pairs,0)
  assert.ok(validation.self_nonadjacent_overlap_pairs<=1)
  assert.equal(validation.browser_verified,false)
})
