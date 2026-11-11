import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {inflateSync} from 'node:zlib'
import {Texture} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createBodyAppearance,MUSCLE_DETAIL_URL} from './bodyAppearance.js'
import {BODY_MORPH_MODEL_URL} from './bodyMorphs.js'

test('real baked 2048px normal texture contains non-flat tangent normal detail',async()=>{
  const bytes=await readFile(new URL('../../../public'+MUSCLE_DETAIL_URL,import.meta.url))
  assert.equal(bytes.readUInt32BE(16),2048);assert.equal(bytes.readUInt32BE(20),2048)
  assert.equal(bytes[24],8)
  const channels=bytes[25]===2?3:bytes[25]===6?4:0;assert.ok(channels)
  const chunks=[]
  for(let at=8;at<bytes.length;){const n=bytes.readUInt32BE(at);if(bytes.toString('ascii',at+4,at+8)==='IDAT')chunks.push(bytes.subarray(at+8,at+8+n));at+=n+12}
  const raw=inflateSync(Buffer.concat(chunks)),stride=2048*channels
  let previous=new Uint8Array(stride),changed=0
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c}
  for(let row=0;row<2048;row++){
    const offset=row*(stride+1),filter=raw[offset],line=new Uint8Array(stride)
    for(let col=0;col<stride;col++){
      const a=col>=channels?line[col-channels]:0,b=previous[col],c=col>=channels?previous[col-channels]:0
      const prediction=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter]
      assert.ok(prediction!==undefined);line[col]=(raw[offset+col+1]+prediction)&255
    }
    for(let col=0;col<stride;col+=channels)if(line[col+2]>127&&Math.abs(line[col]-128)+Math.abs(line[col+1]-128)>12)changed++
    previous=line
  }
  assert.ok(changed>1000,'A flat blue placeholder must not pass as a muscle normal map')
})

test('simplified body style never applies supplied muscle texture and preserves original shading across presets/remounts',async()=>{
  const bytes=await readFile(new URL('../../../public'+BODY_MORPH_MODEL_URL,import.meta.url))
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
  let mesh;scene.traverse(o=>{if(o.isMesh)mesh=o})
  const original=mesh.material,geometry=mesh.geometry,positions=geometry.attributes.position.array.slice()
  const other=mesh.clone(),texture=new Texture();let textureDisposed=0
  texture.addEventListener('dispose',()=>textureDisposed++)
  for(let mount=0;mount<2;mount++){
    const appearance=createBodyAppearance(scene)
    appearance.setBuild('muscular',texture)
    assert.notEqual(mesh.material,original);assert.equal(mesh.material.normalMap,original.normalMap)
    assert.equal(mesh.material.roughness,original.roughness)
    assert.ok(mesh.material.color.equals(original.color));assert.equal(other.material,original)
    assert.equal(mesh.geometry,geometry);assert.deepEqual(mesh.geometry.attributes.position.array,positions)
    for(const build of ['average','slim']){
      appearance.setBuild(build,texture);assert.equal(mesh.material.normalMap,original.normalMap)
      assert.equal(mesh.material.roughness,original.roughness)
    }
    appearance.setBuild('muscular',null);assert.equal(mesh.material.normalMap,original.normalMap)
    appearance.dispose();assert.equal(mesh.material,original)
  }
  assert.equal(textureDisposed,0,'Texture lifetime belongs to the loader, not material instances')
})
