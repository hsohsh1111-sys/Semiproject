import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ShaderLib, Texture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createGarmentInstance, PANTS_GLB, OUTER_GLB, NEUTRAL_CAP_GLB } from './garmentGlb.js'
import { createGarmentAppearance, createModelAppearance, GARMENT_COLORS, PATTERN_CHROMA } from './garmentAppearance.js'

const models = new URL('../../../public/models/', import.meta.url)
async function load(name, textured = false) {
  const bytes = await readFile(new URL(name, models))
  const loader = new GLTFLoader()
  // Geometry/material tests only; WebGL texture decoding is browser-only.
  if (textured) loader.register(() => ({ name: 'NodeTextureDecodeStub', loadTexture: () => Promise.resolve(new Texture()) }))
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}
const asset = await load('ONFIT_TShirt.glb', true)
const body = await load('ONFIT_Human_Test_BodyOnly.glb')
const meshOf = scene => scene.getObjectByName('ONFIT_TShirt')
const compile = material => {
  const shader = { uniforms: {}, fragmentShader: ShaderLib.standard.fragmentShader }
  material.onBeforeCompile(shader, {})
  return shader
}

test('all four exact palette colors update a stable uniform without changing geometry, UVs or transforms', () => {
  const scene = createGarmentInstance(asset), mesh = meshOf(scene)
  const positions = mesh.geometry.attributes.position.array.slice()
  const normals = mesh.geometry.attributes.normal.array.slice(), uv = mesh.geometry.attributes.uv.array.slice()
  const index = mesh.geometry.index.array.slice(), transform = mesh.matrix.clone()
  const appearance = createGarmentAppearance(scene), shader = compile(mesh.material), version = mesh.material.version
  assert.deepEqual(GARMENT_COLORS.map(c => c.hex), ['#F2F2F2', '#16181D', '#373B43', '#1B2944'])
  for (const color of GARMENT_COLORS) {
    appearance.setColor(color.id)
    assert.equal(shader.uniforms.onfitFabricColor.value.getHexString(), color.hex.slice(1).toLowerCase())
    assert.equal(mesh.material.version, version, 'color switch recompiles the material')
  }
  assert.deepEqual(mesh.geometry.attributes.position.array, positions)
  assert.deepEqual(mesh.geometry.attributes.normal.array, normals)
  assert.deepEqual(mesh.geometry.attributes.uv.array, uv)
  assert.deepEqual(mesh.geometry.index.array, index)
  assert.deepEqual(mesh.matrix, transform)
  appearance.dispose()
})

test('only instance garment materials are cloned; cached originals, another garment and skin remain unchanged', () => {
  const first = createGarmentInstance(asset), second = createGarmentInstance(asset)
  const original = meshOf(asset.scene).material, originalColor = original.color.clone()
  const skin = []
  body.scene.traverse(mesh => { if (mesh.material) skin.push([mesh, mesh.material, mesh.material.color.clone()]) })
  const appearance = createGarmentAppearance(first)
  appearance.setColor('black')
  assert.notEqual(meshOf(first).material, original)
  assert.equal(meshOf(second).material, original)
  assert.deepEqual(original.color, originalColor)
  for (const [mesh, material, color] of skin) {
    assert.equal(mesh.material, material)
    assert.deepEqual(mesh.material.color, color)
  }
  appearance.dispose()
})

test('original print/color and normal texture references survive; PBR lighting stays matte and nonemissive', () => {
  const scene = createGarmentInstance(asset), mesh = meshOf(scene), original = mesh.material
  const appearance = createGarmentAppearance(scene), shader = compile(mesh.material)
  appearance.setColor('navy')
  assert.equal(mesh.material.map, original.map)
  assert.equal(mesh.material.normalMap, original.normalMap)
  assert.equal(mesh.material.side, original.side)
  assert.equal(mesh.material.transparent, original.transparent)
  assert.ok(mesh.material.roughness >= .84 && mesh.material.roughness <= .95)
  assert.equal(mesh.material.metalness, 0)
  assert.equal(mesh.material.emissive.getHex(), 0)
  assert.ok(shader.fragmentShader.includes('#include <map_fragment>'))
  assert.ok(shader.fragmentShader.includes('mix(onfitFabricColor * onfitShade, diffuseColor.rgb, onfitPatternWeight)'))
  assert.ok(shader.fragmentShader.includes('#include <normal_fragment_maps>'))
  assert.ok(shader.fragmentShader.includes('#include <lights_fragment_begin>'))
  // This asset's neutral cloth is low-chroma; orange/blue-grey printed texels
  // fall above the preservation threshold. These are not universal logo labels.
  assert.ok(PATTERN_CHROMA[0] > 0 && PATTERN_CHROMA[1] < .1)
  appearance.dispose()
})

test('remount/reload can reapply the chosen color and disposal frees clones without disposing shared textures', () => {
  const original = meshOf(asset.scene).material
  let textureDisposals = 0, cloneDisposals = 0
  const textureListener = () => { textureDisposals++ }
  original.map.addEventListener('dispose', textureListener)
  for (let i = 0; i < 2; i++) {
    const scene = createGarmentInstance(asset), appearance = createGarmentAppearance(scene), mesh = meshOf(scene)
    mesh.material.addEventListener('dispose', () => { cloneDisposals++ })
    const shader = compile(mesh.material)
    appearance.setColor('charcoal')
    assert.equal(shader.uniforms.onfitFabricColor.value.getHexString(), '373b43')
    appearance.dispose(); appearance.dispose()
    assert.equal(mesh.material, original)
  }
  assert.equal(cloneDisposals, 2)
  assert.equal(textureDisposals, 0)
  original.map.removeEventListener('dispose', textureListener)
})

test('unsupported colors are rejected without modifying the selected color', () => {
  const scene = createGarmentInstance(asset), appearance = createGarmentAppearance(scene)
  const shader = compile(meshOf(scene).material)
  appearance.setColor('black')
  assert.throws(() => appearance.setColor('not-a-color'))
  assert.equal(shader.uniforms.onfitFabricColor.value.getHexString(), '16181d')
  appearance.setColor('#7c3aed')
  assert.equal(shader.uniforms.onfitFabricColor.value.getHexString(), '7c3aed')
  assert.throws(() => appearance.setColor('#xyzxyz'))
  assert.equal(shader.uniforms.onfitFabricColor.value.getHexString(), '7c3aed')
  appearance.dispose()
})

test('colored long-sleeve and hooded fabric can be recolored instead of being mistaken for a protected print', async () => {
  for (const name of ['ONFIT_LongSleeve_BodyMorph_v1.glb','ONFIT_HoodedJacket_BodyMorph_v1.glb']) {
    const gltf=await load(name,true),scene=createGarmentInstance(gltf)
    let mesh;scene.traverse(object=>{if(object.isMesh)mesh=object})
    const original=mesh.material,geometry=mesh.geometry
    const appearance=createGarmentAppearance(scene,{preservePattern:false}),shader=compile(mesh.material)
    appearance.setColor('#55aa88')
    assert.equal(shader.uniforms.onfitFabricColor.value.getHexString(),'55aa88')
    assert.ok(shader.fragmentShader.includes('float onfitPatternWeight = 0.0;'))
    assert.equal(mesh.geometry,geometry);assert.equal(mesh.material.map,original.map)
    appearance.dispose();assert.equal(mesh.material,original)
  }
})

test('bottom, outer and cap independently support custom colors and restore authored defaults without changing meshes',async()=>{
  const instances=[]
  for(const model of [PANTS_GLB,OUTER_GLB,NEUTRAL_CAP_GLB]){
    const gltf=await load(model.url.split('/').pop(),true),scene=createGarmentInstance(gltf)
    let mesh;scene.traverse(object=>{if(object.isMesh)mesh=object})
    const original=mesh.material,geometry=mesh.geometry,positions=geometry.attributes.position.array.slice()
    const appearance=createModelAppearance(scene,model),shader=compile(mesh.material)
    appearance.setColor('#aabbcc')
    if(model.slot==='headwear')assert.equal(mesh.material.color.getHexString(),'aabbcc')
    else {assert.equal(shader.uniforms.onfitFabricEnabled.value,1);assert.equal(shader.uniforms.onfitFabricColor.value.getHexString(),'aabbcc')}
    assert.equal(mesh.geometry,geometry);assert.deepEqual(geometry.attributes.position.array,positions)
    assert.equal(mesh.material.map,original.map)
    instances.push({appearance,mesh,original,shader,model})
  }
  instances[0].appearance.setColor('#112233')
  assert.equal(instances[1].shader.uniforms.onfitFabricColor.value.getHexString(),'aabbcc')
  assert.equal(instances[2].mesh.material.color.getHexString(),'aabbcc')
  for(const {appearance,mesh,original,shader,model}of instances){
    appearance.setColor('default')
    assert.ok(mesh.material.color.equals(original.color))
    if(model.slot!=='headwear'){
      assert.equal(shader.uniforms.onfitFabricEnabled.value,0)
      assert.equal(mesh.material.roughness,original.roughness)
      assert.equal(mesh.material.metalness,original.metalness)
      assert.ok(mesh.material.emissive.equals(original.emissive))
    }
    appearance.setColor('#123456')
    if(model.slot!=='headwear')assert.equal(shader.uniforms.onfitFabricEnabled.value,1)
    appearance.dispose();assert.equal(mesh.material,original)
  }
})
