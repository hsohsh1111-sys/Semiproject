import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Group, Texture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { PANTS_GLB, TSHIRT_MORPH_GLB, createGarmentInstance, loadGarmentAsset, disposeGarmentAsset } from './garmentGlb.js'
import { createModelAppearance, GARMENT_COLORS } from './garmentAppearance.js'
import { modelLayout, preciseBounds } from './glbGeometry.js'

const folder=new URL('../../../public/models/',import.meta.url)
const read=name=>readFile(new URL(name,folder))
const report=JSON.parse(await readFile(new URL('../../../../assets/blender/ONFIT_Pants_v1.source.json',import.meta.url),'utf8'))
const validation=JSON.parse(await readFile(new URL('../../../../assets/blender/pants_v1_final.validation.json',import.meta.url),'utf8'))
const bytes=await read('ONFIT_Pants_v1.glb')
const loader=()=>new GLTFLoader().register(()=>({name:'NodeTextureDecodeStub',loadTexture:()=>Promise.resolve(new Texture())}))
async function load(name){const b=await read(name);return loader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')}
const pants=await load('ONFIT_Pants_v1.glb'),shirt=await load('ONFIT_TShirt_BodyMorph_v3.glb'),body=await load('ONFIT_Human_BodyMorph_v3.glb')
const mesh=scene=>{let m;scene.traverse(o=>{if(o.isMesh)m=o});return m}

test('actual CC0 pants export contains only pants, UV/textures and no invented morph targets',async()=>{
  assert.equal(report.asset_name,'male_casualsuit06');assert.equal(report.license,'CC0')
  assert.equal(report.extracted_component,'full-length pants');assert.equal(report.morph_targets,0)
  assert.equal(createHash('sha256').update(bytes).digest('hex'),report.glb_sha256)
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)))
  assert.equal(doc.meshes.length,1);assert.equal(doc.nodes.length,1)
  assert.equal(doc.nodes[0].name,'ONFIT_Pants')
  const m=mesh(pants.scene)
  assert.equal(m.geometry.index.count/3,6848)
  assert.ok(m.geometry.attributes.uv && m.material.map && m.material.normalMap)
  assert.equal(m.material.transparent,false)
  assert.equal(m.geometry.morphAttributes.position,undefined)
  for(const [name,hash]of Object.entries(validation.input_hashes))assert.equal(createHash('sha256').update(await read(name)).digest('hex'),hash)
})

test('shared body layout aligns waistband through ankle and supports independent top/bottom visibility',()=>{
  const wrapper=new Group(),layout=modelLayout(body.scene)
  wrapper.position.fromArray(layout.position);wrapper.scale.setScalar(layout.scale)
  const top=createGarmentInstance(shirt),bottom=createGarmentInstance(pants)
  wrapper.add(body.scene.clone(true),top,bottom)
  wrapper.updateMatrixWorld(true)
  const pantsBounds=preciseBounds(bottom),topBounds=preciseBounds(top)
  assert.ok(pantsBounds.min.y>=0 && pantsBounds.min.y<.12)
  assert.ok(pantsBounds.max.y>.85 && pantsBounds.max.y<1.05)
  assert.ok(pantsBounds.max.y>topBounds.min.y)
  assert.ok(pantsBounds.max.y<topBounds.max.y)
  assert.equal(PANTS_GLB.slot,'bottom');assert.equal(TSHIRT_MORPH_GLB.slot,'top')
  const before=top.matrixWorld.elements.slice()
  wrapper.remove(bottom);wrapper.updateMatrixWorld(true)
  assert.deepEqual(top.matrixWorld.elements,before)
  assert.ok(wrapper.children.includes(top))
  wrapper.add(bottom);wrapper.remove(top);wrapper.updateMatrixWorld(true)
  assert.deepEqual(preciseBounds(bottom).min.toArray(),pantsBounds.min.toArray())
})

test('shirt color changes never recolor pants or change their authored material/geometry',()=>{
  const top=createGarmentInstance(shirt),bottom=createGarmentInstance(pants),m=mesh(bottom)
  const original=m.material,positions=m.geometry.attributes.position.array.slice()
  assert.equal(createModelAppearance(bottom,PANTS_GLB),null)
  const appearance=createModelAppearance(top,TSHIRT_MORPH_GLB)
  for(const color of GARMENT_COLORS){
    appearance.setColor(color.id)
    assert.equal(m.material,original)
    assert.deepEqual(m.geometry.attributes.position.array,positions)
  }
  appearance.dispose()
})

test('pants loader can mount/unmount/reload without disposing independent shirt resources',async()=>{
  let shirtDisposals=0
  mesh(shirt.scene).material.map.addEventListener('dispose',()=>shirtDisposals++)
  for(let i=0;i<2;i++){
    const result=await loadGarmentAsset(PANTS_GLB.url,{loader:loader(),fetcher:async()=>({ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)})})
    assert.ok(mesh(result.scene).geometry.attributes.position.count>3000)
    disposeGarmentAsset(result.asset)
    assert.equal(shirtDisposals,0)
  }
})

test('baseline mesh validation records clean body clearance and the remaining shirt hem overlaps honestly',()=>{
  assert.equal(validation.inside_over_2mm,0)
  assert.ok(validation.min_signed_skin_gap_m>.003)
  assert.equal(validation.body_overlap_pairs,0)
  assert.equal(validation.self_nonadjacent_overlap_pairs,0)
  assert.equal(validation.degenerate_triangles,0)
  // Known remaining top/bottom seam contact; do not label the outfit collision-free.
  assert.ok(validation.shirt_overlap_pairs>0)
})
