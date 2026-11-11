import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { applyInbodyBodyPreview } from './inbodyBodyPreview.js'
import { BODY_PRESETS } from './bodyPresets.js'
import { applyBodyMorphs, BODY_MORPH_MODEL_URL, bodyBuildWeights, bodyMorphWeights } from './bodyMorphs.js'
import { applyGarmentMorphs, TSHIRT_MORPH_GLB } from './garmentGlb.js'
import { captureMorphWeights } from './glbGeometry.js'
import { localParameters } from '../../services/fitting.js'

const preview = { approximate: true, measurements: { height_cm: 183.25, weight_kg: 81.5 },
  personalized_measurements: { ...BODY_PRESETS.average.values, height_cm: 183.25, weight_kg: 81.5,
    shoulder_width_cm: 45.75, chest_circumference_cm: 104.25, waist_circumference_cm: 85.5,
    abdomen_protrusion_cm: 1.25, pelvis_width_cm: 31.25 },
  composition: { kind: 'inbody', build_lean: 0.08, build_muscular: 0.37, abdominal_definition: 0.03 } }

test('personal body applies server values directly, preserving measured height and weight', () => {
  const result = applyInbodyBodyPreview(preview)
  assert.deepEqual(result.values, preview.personalized_measurements)
  assert.deepEqual(result.bodyBuild, preview.composition)
  assert.notEqual(result.values.shoulder_width_cm, BODY_PRESETS.average.values.shoulder_width_cm)
  assert.deepEqual(bodyBuildWeights(result.bodyBuild), {build_lean: 0.08, build_muscular: 0.37})
})

test('legacy preset responses and invalid personal blends are not silently accepted', () => {
  assert.throws(() => applyInbodyBodyPreview(null))
  assert.throws(() => applyInbodyBodyPreview({preset: 'muscular', measurements: preview.measurements, approximate: true}))
  assert.throws(() => applyInbodyBodyPreview({...preview, composition: {...preview.composition, build_muscular: 2}}))
  assert.throws(() => applyInbodyBodyPreview({...preview, personalized_measurements: {...preview.personalized_measurements, height_cm: 175}}))
})

test('continuous composition changes real body vertices and restores original preset', async () => {
  const bytes=await readFile(new URL('../../../public'+BODY_MORPH_MODEL_URL,import.meta.url))
  const loader=new GLTFLoader().register(()=>({name:'TextureStub',loadTexture:()=>Promise.resolve(new Texture())}))
  const {scene}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
  const defaults=captureMorphWeights(scene)
  const points=()=>{const values=[];scene.traverse(mesh=>{if(mesh.isMesh)for(let i=0;i<mesh.geometry.attributes.position.count;i++){const p=mesh.getVertexPosition(i,new Vector3());assert.ok(p.toArray().every(Number.isFinite));values.push(...p.toArray())}});return values}
  const parameters=localParameters(preview.personalized_measurements)
  applyBodyMorphs(scene,defaults,parameters,BODY_MORPH_MODEL_URL,'average');const original=points()
  applyBodyMorphs(scene,defaults,parameters,BODY_MORPH_MODEL_URL,preview.composition);const a=points()
  applyBodyMorphs(scene,defaults,parameters,BODY_MORPH_MODEL_URL,{...preview.composition,build_muscular:0.38});const b=points()
  assert.ok(a.some((v,i)=>Math.abs(v-original[i])>1e-6))
  assert.ok(a.some((v,i)=>Math.abs(v-b[i])>1e-6))
  applyBodyMorphs(scene,defaults,parameters,BODY_MORPH_MODEL_URL,'average');assert.deepEqual(points(),original)
})

test('existing shirt accepts the same fractional composition without replacing geometry', async () => {
  const bytes=await readFile(new URL('../../../public'+TSHIRT_MORPH_GLB.url,import.meta.url))
  const loader=new GLTFLoader().register(()=>({name:'TextureStub',loadTexture:()=>Promise.resolve(new Texture())}))
  const {scene}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
  const defaults=captureMorphWeights(scene)
  const weights=bodyMorphWeights(localParameters(preview.personalized_measurements))
  const positions=()=>{const out=[];scene.traverse(mesh=>{if(mesh.isMesh)for(let i=0;i<mesh.geometry.attributes.position.count;i++){const p=mesh.getVertexPosition(i,new Vector3());assert.ok(p.toArray().every(Number.isFinite));out.push(...p.toArray())}});return out}
  applyGarmentMorphs(scene,defaults,{...weights,...bodyBuildWeights('average')},TSHIRT_MORPH_GLB.url)
  const original=positions()
  applyGarmentMorphs(scene,defaults,{...weights,...bodyBuildWeights(preview.composition)},TSHIRT_MORPH_GLB.url)
  assert.ok(positions().some((value,i)=>Math.abs(value-original[i])>1e-6))
  applyGarmentMorphs(scene,defaults,{...weights,...bodyBuildWeights('average')},TSHIRT_MORPH_GLB.url)
  assert.deepEqual(positions(),original)
})
