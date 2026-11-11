import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {Group,Texture,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {modelLayout,modelHeightLayout,preciseFrame} from './glbGeometry.js'
import {BODY_MORPH_MODEL_URL} from './bodyMorphs.js'
import {TSHIRT_MORPH_GLB} from './garmentGlb.js'

const load=async path=>{
  const b=await readFile(new URL('../../../public'+path,import.meta.url))
  return (await new GLTFLoader().register(()=>({name:'TextureStub',loadTexture:()=>Promise.resolve(new Texture())})).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene
}
test('height changes across 100–230cm keep feet grounded and preserve width/depth/head/limb proportions',async()=>{
  const body=await load(BODY_MORPH_MODEL_URL),layout=modelLayout(body),parent=new Group();parent.add(body)
  let widthRatio,depthRatio
  for(const h of [1,1.5,1.75,2,2.3]){
    const next=modelHeightLayout(layout,h);parent.scale.fromArray(next.scale);parent.position.fromArray(next.position)
    const {bounds}=preciseFrame(body),size=bounds.getSize(new Vector3())
    assert.ok(Math.abs(size.y-h)<1e-6);assert.ok(Math.abs(bounds.min.y)<1e-6)
    if(widthRatio!==undefined){assert.ok(Math.abs(size.x/h-widthRatio)<1e-6);assert.ok(Math.abs(size.z/h-depthRatio)<1e-6)}
    widthRatio=size.x/h;depthRatio=size.z/h
    assert.equal(next.scale[0],next.scale[1]);assert.equal(next.scale[1],next.scale[2])
  }
})
test('clothes share height change without edits to their original vertices or Morph Targets',async()=>{
  const body=await load(BODY_MORPH_MODEL_URL),shirt=await load(TSHIRT_MORPH_GLB.url),layout=modelLayout(body),parent=new Group();parent.add(body,shirt)
  let mesh;shirt.traverse(o=>{if(o.isMesh)mesh=o})
  const positions=mesh.geometry.attributes.position.array.slice(),weights=mesh.morphTargetInfluences.slice()
  const apply=h=>{const next=modelHeightLayout(layout,h);parent.scale.fromArray(next.scale);parent.position.fromArray(next.position);return preciseFrame(shirt).bounds.getSize(new Vector3())}
  const a=apply(1.5),b=apply(2)
  for(const axis of ['x','y','z'])assert.ok(Math.abs(b[axis]/a[axis]-2/1.5)<1e-6)
  assert.deepEqual(mesh.geometry.attributes.position.array,positions);assert.deepEqual(mesh.morphTargetInfluences,weights)
  const base=modelHeightLayout(layout,NaN);assert.equal(base.scale[1],layout.scale)
})
