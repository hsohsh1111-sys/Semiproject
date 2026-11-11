import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'
import { Mesh, Texture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { CAP_COLORS } from './capAppearance.js'
import { createModelAppearance } from './garmentAppearance.js'
import { CAP_GLB, NEUTRAL_CAP_GLB, loadGarmentAsset, disposeGarmentAsset } from './garmentGlb.js'
import { preciseBounds } from './glbGeometry.js'

const models=new URL('../../../public/models/',import.meta.url),assets=new URL('../../../../assets/blender/',import.meta.url)
const read=name=>readFile(new URL(name,models))
const loader=()=>new GLTFLoader().register(()=>({name:'NodeTextureDecodeStub',loadTexture:()=>Promise.resolve(new Texture())}))
async function load(name){const b=await read(name);return loader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')}
const neutral=await load('ONFIT_Cap_Neutral_v1.glb'),old=await load('ONFIT_Cap_v1.glb')
const source=JSON.parse(await readFile(new URL('ONFIT_Cap_Neutral_v1.source.json',assets),'utf8'))
const validation=JSON.parse(await readFile(new URL('ONFIT_Cap_Neutral_v1.validation.json',assets),'utf8'))
const mesh=s=>{let found;s.traverse(o=>{if(o.isMesh)found=o});return found}
const json=b=>JSON.parse(b.subarray(20,20+b.readUInt32LE(12)))
const bin=b=>{const n=b.readUInt32LE(12);return b.subarray(28+n,28+n+b.readUInt32LE(20+n))}

test('neutral cap preserves ALL positions/normals/UVs, triangle order, transforms, bounds and no-morph contract',()=>{
  const a=mesh(old.scene),b=mesh(neutral.scene)
  for(const name of Object.keys(a.geometry.attributes))assert.deepEqual(b.geometry.attributes[name].array,a.geometry.attributes[name].array,name)
  assert.deepEqual(b.geometry.index.array,a.geometry.index.array)
  assert.deepEqual(b.matrix.elements,a.matrix.elements)
  assert.deepEqual(preciseBounds(neutral.scene),preciseBounds(old.scene))
  assert.equal(b.geometry.morphAttributes.position,undefined)
  assert.equal(NEUTRAL_CAP_GLB.slot,'headwear');assert.equal(NEUTRAL_CAP_GLB.defaultColor,'black')
})

test('print is removed from the only albedo image; new PNG is entirely opaque white, with black PBR default',async()=>{
  const bytes=await read('ONFIT_Cap_Neutral_v1.glb'),doc=json(bytes),binary=bin(bytes)
  assert.equal(doc.meshes.length,1);assert.equal(doc.nodes.length,1);assert.equal(doc.images.length,1)
  const view=doc.bufferViews[doc.images[0].bufferView],png=binary.subarray(view.byteOffset,view.byteOffset+view.byteLength)
  const idat=[]
  for(let at=8;at<png.length;){const n=png.readUInt32BE(at),type=png.subarray(at+4,at+8).toString();if(type==='IDAT')idat.push(png.subarray(at+8,at+8+n));at+=12+n}
  const pixels=inflateSync(Buffer.concat(idat));assert.equal(pixels.length,4*17)
  for(let row=0;row<4;row++){assert.equal(pixels[row*17],0);assert.ok(pixels.subarray(row*17+1,row*17+17).every(v=>v===255))}
  const oldDoc=json(await read('ONFIT_Cap_v1.glb')),oldBin=bin(await read('ONFIT_Cap_v1.glb')),oldView=oldDoc.bufferViews[oldDoc.images[0].bufferView]
  assert.ok(!binary.includes(oldBin.subarray(oldView.byteOffset,oldView.byteOffset+oldView.byteLength)))
  const material=mesh(neutral.scene).material
  assert.equal(material.color.getHexString(),'16181d');assert.equal(material.transparent,false)
  assert.equal(material.metalness,0);assert.equal(material.roughness,.88)
})

test('four exact cap colors update cloned material only; skin, shirt and shared source stay unchanged',()=>{
  assert.deepEqual(CAP_COLORS.map(c=>c.hex),['#16181D','#1B2944','#C8B89D','#373B43'])
  const scene=neutral.scene.clone(true),m=mesh(scene),original=m.material
  const skin=new Mesh(m.geometry,original),shirt=new Mesh(m.geometry,original)
  const geometry=m.geometry,positions=geometry.attributes.position.array.slice(),normal=geometry.attributes.normal.array.slice(),matrix=m.matrix.elements.slice()
  const appearance=createModelAppearance(scene,NEUTRAL_CAP_GLB)
  assert.notEqual(m.material,original);assert.equal(m.material.map,original.map)
  for(const color of CAP_COLORS){
    appearance.setColor(color.id);assert.equal(m.material.color.getHexString(),color.hex.slice(1).toLowerCase())
    assert.equal(skin.material,original);assert.equal(shirt.material,original);assert.equal(original.color.getHexString(),'16181d')
    assert.equal(m.geometry,geometry);assert.deepEqual(geometry.attributes.position.array,positions);assert.deepEqual(geometry.attributes.normal.array,normal)
    assert.deepEqual(m.matrix.elements,matrix)
  }
  assert.throws(()=>appearance.setColor('red'),/지원하지/)
  appearance.dispose();assert.equal(m.material,original)
  assert.equal(createModelAppearance(old.scene,CAP_GLB),null)
})

test('cap color switches reuse one loaded asset; unmount/reload restores selected color without mutating source',async()=>{
  const bytes=await read('ONFIT_Cap_Neutral_v1.glb');let requests=0
  for(let cycle=0;cycle<2;cycle++){
    const result=await loadGarmentAsset(NEUTRAL_CAP_GLB.url,{loader:loader(),fetcher:async()=>{requests++;return{ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}}})
    const appearance=createModelAppearance(result.scene,NEUTRAL_CAP_GLB),before=requests
    for(const color of CAP_COLORS)appearance.setColor(color.id)
    appearance.setColor('beige');assert.equal(mesh(result.scene).material.color.getHexString(),'c8b89d')
    assert.equal(requests,before)
    appearance.dispose();disposeGarmentAsset(result.asset)
  }
  assert.equal(requests,2);assert.equal(mesh(neutral.scene).material.color.getHexString(),'16181d')
})

test('original hashes and measured head/outfit/hood clearances remain intact',async()=>{
  const hash=b=>createHash('sha256').update(b).digest('hex')
  assert.equal(hash(await readFile(source.source)),source.source_sha256)
  assert.equal(hash(await read('ONFIT_Cap_Neutral_v1.glb')),source.output_sha256)
  for(const [name,digest]of Object.entries(validation.input_hashes))assert.equal(hash(await read(name)),digest)
  for(const slot of ['body','top','bottom','outer','hood'])assert.equal(validation.checks[slot].overlap_pairs,0,slot)
  assert.ok(validation.hood_corner_checks.every(c=>c.cap_overlap_pairs===0))
  assert.equal(validation.self_nonadjacent_overlap_pairs,346);assert.equal(validation.degenerate_triangles,0)
  assert.equal(validation.browser_verified,false)
})
