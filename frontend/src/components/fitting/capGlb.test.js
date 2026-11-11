import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Group, Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { CAP_GLB, GARMENT_SLOTS, applyGarmentMorphs, loadGarmentAsset, disposeGarmentAsset } from './garmentGlb.js'
import { captureMorphWeights, preciseBounds, modelLayout } from './glbGeometry.js'
import { bodyMorphWeights, applyBodyMorphs, BODY_MORPH_MODEL_URL } from './bodyMorphs.js'
import { createModelAppearance } from './garmentAppearance.js'

const models=new URL('../../../public/models/',import.meta.url),assets=new URL('../../../../assets/blender/',import.meta.url)
const read=name=>readFile(new URL(name,models))
// Geometry/loader evaluation uses real GLTFLoader. Browser image decoding is
// stubbed here and is not counted as browser/WebGL visual verification.
const loader=()=>new GLTFLoader().register(()=>({name:'NodeTextureDecodeStub',loadTexture:()=>Promise.resolve(new Texture())}))
async function load(name){const b=await read(name);return loader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')}
const cap=await load('ONFIT_Cap_v1.glb'),body=await load('ONFIT_Human_BodyMorph_v3.glb')
const top=await load('ONFIT_TShirt_BodyMorph_v5.glb'),pants=await load('ONFIT_Pants_BodyMorph_v2.glb'),outer=await load('ONFIT_Outer_BodyMorph_v1.glb')
const source=JSON.parse(await readFile(new URL('ONFIT_Cap_v1.source.json',assets),'utf8'))
const validation=JSON.parse(await readFile(new URL('ONFIT_Cap_v1.validation.json',assets),'utf8'))
const meshes=s=>{const result=[];s.traverse(o=>{if(o.isMesh)result.push(o)});return result}

test('licensed authored cap GLB has one textured 3D mesh, UVs and no body/helpers/morphs',async()=>{
  const bytes=await read('ONFIT_Cap_v1.glb'),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)))
  assert.equal(source.asset_name,'toigo_maga_hat');assert.equal(source.license,'CC0');assert.equal(source.author,'MRT')
  assert.equal(doc.meshes.length,1);assert.equal(doc.nodes.length,1);assert.equal(meshes(cap.scene).length,1)
  assert.equal(meshes(cap.scene)[0].name,'ONFIT_Cap')
  const m=meshes(cap.scene)[0],g=m.geometry
  assert.ok(g.index.count/3>3000&&g.attributes.position.count>3000)
  assert.ok(m.material.map&&g.attributes.uv&&g.attributes.normal)
  assert.equal(g.morphAttributes.position,undefined)
  assert.ok(Array.from(g.attributes.position.array).every(Number.isFinite))
  for(let i=0;i<g.attributes.normal.count;i++)assert.ok(new Vector3().fromBufferAttribute(g.attributes.normal,i).length()>.9)
})

test('cap crown and actual forward brim stay at the head in the common mannequin layout',()=>{
  const layout=modelLayout(body.scene),group=new Group();group.scale.setScalar(layout.scale);group.position.fromArray(layout.position)
  const human=body.scene.clone(true),hat=cap.scene.clone(true);group.add(human,hat);group.updateMatrixWorld(true)
  const head=preciseBounds(human),bounds=preciseBounds(hat)
  assert.ok(bounds.min.y>head.max.y-.25)
  assert.ok(bounds.max.y>head.max.y)
  // In glTF +Z faces forward; the real brim protrudes beyond the head front.
  const headFront=-validation.head_bounds_blender.min[1]*layout.scale+layout.position[2]
  assert.ok(bounds.max.z>headFront+.03*layout.scale)
  assert.ok(bounds.max.x-bounds.min.x>.14&&bounds.max.x-bounds.min.x<.22)
})

test('headwear mounts independently with existing three outfit slots and preserves all materials',()=>{
  assert.ok(GARMENT_SLOTS.includes('headwear'));assert.equal(CAP_GLB.slot,'headwear')
  assert.equal(CAP_GLB.tintable,false);assert.equal(CAP_GLB.supportsMorphs,false)
  const group=new Group(),hat=cap.scene.clone(true),human=body.scene.clone(true)
  const outfit=[top.scene.clone(true),pants.scene.clone(true),outer.scene.clone(true)]
  group.add(human,...outfit)
  const bodyMaterial=meshes(human)[0].material,shirtMaterial=meshes(outfit[0])[0].material,hatMaterial=meshes(hat)[0].material
  assert.equal(createModelAppearance(hat,CAP_GLB),null)
  for(let i=0;i<3;i++){
    group.add(hat);assert.equal(group.children.length,5)
    group.remove(hat);assert.ok(outfit.every(o=>group.children.includes(o)))
  }
  assert.equal(meshes(human)[0].material,bodyMaterial);assert.equal(meshes(outfit[0])[0].material,shirtMaterial)
  assert.equal(meshes(hat)[0].material,hatMaterial)
})

test('full body slider extremes never deform or move the static cap',()=>{
  const human=body.scene.clone(true),hat=cap.scene.clone(true),m=meshes(hat)[0]
  const positions=m.geometry.attributes.position.array.slice(),matrix=m.matrix.elements.slice()
  const defaults=captureMorphWeights(human),hatDefaults=captureMorphWeights(hat)
  for(const parameters of [
    {shoulder_width_m:.65,chest_radius_m:1.8/(2*Math.PI),waist_radius_m:1.8/(2*Math.PI),abdomen_protrusion_m:.20,pelvis_width_m:.6,hip_radius_m:1.8/(2*Math.PI),thigh_radius_m:1/(2*Math.PI)},
    {shoulder_width_m:.25,chest_radius_m:.55/(2*Math.PI),waist_radius_m:.45/(2*Math.PI),abdomen_protrusion_m:0,pelvis_width_m:.20},
  ]){
    applyBodyMorphs(human,defaults,parameters,BODY_MORPH_MODEL_URL)
    applyGarmentMorphs(hat,hatDefaults,bodyMorphWeights(parameters),CAP_GLB.url)
    assert.deepEqual(m.geometry.attributes.position.array,positions)
    assert.deepEqual(m.matrix.elements,matrix)
  }
})

test('existing garment loader can load/unmount/reload cap independently',async()=>{
  const bytes=await read('ONFIT_Cap_v1.glb');let disposed=0
  meshes(top.scene)[0].material.map.addEventListener('dispose',()=>disposed++)
  for(let i=0;i<2;i++){
    const result=await loadGarmentAsset(CAP_GLB.url,{loader:loader(),fetcher:async()=>({ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)})})
    assert.equal(meshes(result.scene).length,1)
    disposeGarmentAsset(result.asset);assert.equal(disposed,0)
  }
})

test('exported head/outfit/down-hood clearance is measured and original assets remain unchanged',async()=>{
  assert.equal(validation.morph_targets,0);assert.equal(validation.degenerate_triangles,0)
  for(const slot of ['body','top','bottom','outer','hood'])assert.equal(validation.checks[slot].overlap_pairs,0,slot)
  assert.ok(validation.checks.body.min_near_signed_gap_m>.002)
  assert.equal(validation.hood_corner_checks.length,16)
  assert.ok(validation.hood_corner_checks.every(c=>c.cap_overlap_pairs===0));assert.equal(validation.supports_down_hood,true)
  assert.equal(validation.browser_verified,false)
  // The exported cap reports nonadjacent self contacts; no claim that these
  // surfaces were repaired or simulated, or that every contact was classified.
  assert.ok(validation.self_nonadjacent_overlap_pairs>0)
  const hash=b=>createHash('sha256').update(b).digest('hex')
  assert.equal(hash(await read('ONFIT_Cap_v1.glb')),source.glb_sha256)
  assert.equal(hash(await readFile(source.source_blend)),source.source_blend_sha256)
  assert.equal(hash(await readFile(source.asset)),source.asset_sha256)
  for(const [name,digest]of Object.entries(validation.input_hashes))assert.equal(hash(await read(name)),digest)
})
