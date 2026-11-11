import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Group, Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OUTER_GLB, PANTS_GLB, TSHIRT_MORPH_GLB, GARMENT_SLOTS, applyGarmentMorphs, loadGarmentAsset, disposeGarmentAsset } from './garmentGlb.js'
import { createModelAppearance, GARMENT_COLORS } from './garmentAppearance.js'
import { captureMorphWeights, modelLayout, preciseBounds } from './glbGeometry.js'
import { bodyMorphWeights } from './bodyMorphs.js'

const folder=new URL('../../../public/models/',import.meta.url)
const read=name=>readFile(new URL(name,folder))
const assets=new URL('../../../../assets/blender/',import.meta.url)
const provenance=JSON.parse(await readFile(new URL('ONFIT_Outer_v1.source.json',assets),'utf8'))
const validation=JSON.parse(await readFile(new URL('outer_final.validation.json',assets),'utf8'))
const loader=()=>new GLTFLoader().register(()=>({name:'NodeTextureDecodeStub',loadTexture:()=>Promise.resolve(new Texture())}))
async function load(name){const bytes=await read(name);return loader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')}
const outer=await load('ONFIT_Outer_v1.glb'),top=await load('ONFIT_TShirt_BodyMorph_v5.glb'),bottom=await load('ONFIT_Pants_BodyMorph_v2.glb'),body=await load('ONFIT_Human_BodyMorph_v3.glb')
const mesh=s=>{let m;s.traverse(o=>{if(o.isMesh)m=o});return m}

test('actual installed CC0 jacket shell exports without bundled inner shirt/jeans or invented morph targets',async()=>{
  assert.equal(provenance.asset_name,'male_casualsuit05');assert.equal(provenance.license,'CC0')
  const bytes=await read('ONFIT_Outer_v1.glb'),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)))
  assert.equal(createHash('sha256').update(bytes).digest('hex'),provenance.glb_sha256)
  assert.equal(doc.meshes.length,1);assert.equal(doc.nodes.length,1);assert.equal(doc.nodes[0].name,'ONFIT_Outer')
  const m=mesh(outer.scene)
  assert.equal(m.geometry.index.count/3,12800)
  assert.equal(m.geometry.morphAttributes.position,undefined)
  assert.ok(m.material.map && m.material.normalMap && m.geometry.attributes.uv)
  assert.equal(m.material.transparent,false)
  for(const [name,hash]of Object.entries(validation.input_hashes))assert.equal(createHash('sha256').update(await read(name)).digest('hex'),hash)
  assert.equal(createHash('sha256').update(await readFile(provenance.source_blend)).digest('hex'),provenance.source_blend_sha256)
  assert.equal(createHash('sha256').update(await readFile(provenance.asset)).digest('hex'),provenance.asset_sha256)
})

test('front/rear hem fitting retains exact authored indices, UVs, material/texture buffers and local transforms',async()=>{
  const initial=await readFile(new URL('outer_drafts/ONFIT_Outer_v1.initial.glb',assets)),current=await read('ONFIT_Outer_v1.glb')
  const binary=b=>{const n=b.readUInt32LE(12);return b.subarray(28+n,28+n+b.readUInt32LE(20+n))}
  assert.ok(binary(current).subarray(0,binary(initial).length).equals(binary(initial)))
  const original=await loader().parseAsync(initial.buffer.slice(initial.byteOffset,initial.byteOffset+initial.byteLength),'')
  const a=mesh(original.scene),b=mesh(outer.scene)
  assert.deepEqual(a.geometry.attributes.uv.array,b.geometry.attributes.uv.array)
  assert.deepEqual(a.geometry.index.array,b.geometry.index.array)
  const p=a.geometry.attributes.position.array,q=b.geometry.attributes.position.array
  for(let i=0;i<p.length;i+=3){assert.equal(p[i],q[i]);assert.equal(p[i+1],q[i+1]);assert.ok(Math.abs(p[i+2]-q[i+2])<=.008001)}
  assert.deepEqual(OUTER_GLB.position,[0,0,0]);assert.deepEqual(OUTER_GLB.scale,[1,1,1])
})

test('outer-only, top+outer, all slots and repeated outer removal keep other garments/layout intact',()=>{
  assert.deepEqual(GARMENT_SLOTS,['top','bottom','outer','headwear'])
  assert.equal(OUTER_GLB.slot,'outer');assert.equal(TSHIRT_MORPH_GLB.slot,'top');assert.equal(PANTS_GLB.slot,'bottom')
  const group=new Group(),layout=modelLayout(body.scene)
  group.scale.setScalar(layout.scale);group.position.fromArray(layout.position)
  const jacket=outer.scene.clone(true),shirt=top.scene.clone(true),jeans=bottom.scene.clone(true)
  group.add(body.scene.clone(true),jacket);group.updateMatrixWorld(true)
  const bounds=preciseBounds(jacket)
  assert.ok(bounds.min.y>.7 && bounds.max.y<1.6)
  group.add(shirt);group.add(jeans);group.updateMatrixWorld(true)
  const matrix=shirt.matrixWorld.elements.slice(),pantsMatrix=jeans.matrixWorld.elements.slice()
  for(let i=0;i<3;i++){
    group.remove(jacket);group.updateMatrixWorld(true)
    assert.ok(group.children.includes(shirt)&&group.children.includes(jeans))
    assert.deepEqual(shirt.matrixWorld.elements,matrix);assert.deepEqual(jeans.matrixWorld.elements,pantsMatrix)
    group.add(jacket);group.updateMatrixWorld(true)
    assert.deepEqual(preciseBounds(jacket).min.toArray(),bounds.min.toArray())
  }
})

test('shirt colors and existing pants signed morphs remain independent of static jacket',()=>{
  const jacket=outer.scene.clone(true),shirt=top.scene.clone(true),jeans=bottom.scene.clone(true)
  const m=mesh(jacket),positions=m.geometry.attributes.position.array.slice(),material=m.material
  assert.equal(createModelAppearance(jacket,OUTER_GLB),null)
  const appearance=createModelAppearance(shirt,TSHIRT_MORPH_GLB),defaults=captureMorphWeights(jeans)
  for(const color of GARMENT_COLORS){
    appearance.setColor(color.id)
    applyGarmentMorphs(jeans,defaults,bodyMorphWeights({pelvis_width_m:.2,hip_radius_m:1.8/(2*Math.PI),thigh_radius_m:.25/(2*Math.PI)}),PANTS_GLB.url)
    assert.ok(mesh(jeans).morphTargetInfluences.some(w=>Math.abs(w)>0))
    assert.deepEqual(m.geometry.attributes.position.array,positions);assert.equal(m.material,material)
  }
  appearance.dispose()
})

test('actual jacket GLB reloads repeatedly without disposing independent shirt textures',async()=>{
  const bytes=await read('ONFIT_Outer_v1.glb');let disposals=0
  mesh(top.scene).material.map.addEventListener('dispose',()=>disposals++)
  for(let i=0;i<3;i++){
    const result=await loadGarmentAsset(OUTER_GLB.url,{loader:loader(),fetcher:async()=>({ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)})})
    assert.ok(mesh(result.scene).geometry.attributes.position.count>6000)
    assert.ok(mesh(result.scene).getVertexPosition(100,new Vector3()).length()>0)
    disposeGarmentAsset(result.asset);assert.equal(disposals,0)
  }
})

test('baseline collision report distinguishes zero body/bottom crossings from remaining cloth self-contact',()=>{
  assert.equal(validation.morph_targets,0)
  assert.equal(validation.checks.body.overlap_pairs,0)
  assert.equal(validation.checks.bottom.overlap_pairs,0)
  assert.equal(validation.degenerate_triangles,0)
  assert.ok(validation.checks.top.overlap_pairs<100)
  // Small cuff/front facing intersections must not be advertised as collision-free.
  assert.ok(validation.self_nonadjacent_overlap_pairs>0)
})
