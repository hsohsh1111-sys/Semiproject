import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { BODY_PRESETS, applyBodyPresetValues, matchesBodyPreset } from './bodyPresets.js'
import { applyBodyMorphs, bodyMorphWeights, bodyBuildWeights, BODY_MORPH_MODEL_URL } from './bodyMorphs.js'
import { captureMorphWeights } from './glbGeometry.js'
import { applyGarmentMorphs, TSHIRT_MORPH_GLB, LONG_SLEEVE_MORPH_GLB, PANTS_GLB, OUTER_GLB, HOODED_JACKET_MORPH_GLB } from './garmentGlb.js'

// Load the actual existing unit conversion without Vite's API env dependency.
const fitting=await readFile(new URL('../../services/fitting.js',import.meta.url),'utf8')
const {localParameters}=await import('data:text/javascript;base64,'+Buffer.from(fitting.replace("import { API_BASE } from './api.js'","const API_BASE=''" )).toString('base64'))

for (const url of [BODY_MORPH_MODEL_URL,TSHIRT_MORPH_GLB.url,LONG_SLEEVE_MORPH_GLB.url,PANTS_GLB.url,OUTER_GLB.url,HOODED_JACKET_MORPH_GLB.url]) {
  test(`preset switch changes real morph vertices and restores slim state: ${url}`,async()=>{
    const bytes=await readFile(new URL('../../../public'+url,import.meta.url))
    const loader=new GLTFLoader().register(()=>({name:'TextureStub',loadTexture:()=>Promise.resolve(new Texture())}))
    const {scene}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
    const defaults=captureMorphWeights(scene)
    const apply=preset=>{const p=localParameters(preset.values),build=Object.entries(BODY_PRESETS).find(([,value])=>value===preset)[0];if(url===BODY_MORPH_MODEL_URL)applyBodyMorphs(scene,defaults,p,url,build);else applyGarmentMorphs(scene,defaults,{...bodyMorphWeights(p),...bodyBuildWeights(build)},url)}
    const points=()=>{const out=[];scene.traverse(mesh=>{if(mesh.isMesh)for(let i=0;i<mesh.geometry.attributes.position.count;i++){const p=mesh.getVertexPosition(i,new Vector3());assert.ok(p.toArray().every(Number.isFinite));out.push(...p.toArray())}});return out}
    apply(BODY_PRESETS.slim);const slim=points()
    apply(BODY_PRESETS.average);const average=points()
    apply(BODY_PRESETS.muscular);const muscular=points()
    assert.ok(slim.some((v,i)=>Math.abs(v-average[i])>1e-5))
    assert.ok(average.some((v,i)=>Math.abs(v-muscular[i])>1e-5))
    apply(BODY_PRESETS.slim);assert.deepEqual(points(),slim)
  })
}

test('preset application preserves measured height/weight and manual changes clear the selected match',()=>{
  const current={...BODY_PRESETS.average.values,height_cm:183,weight_kg:81}
  for(const preset of Object.values(BODY_PRESETS)){
    const next=applyBodyPresetValues(preset,current)
    assert.equal(next.height_cm,183);assert.equal(next.weight_kg,81)
    assert.equal(matchesBodyPreset(preset,next),true)
    assert.equal(matchesBodyPreset(preset,{...next,shoulder_width_cm:next.shoulder_width_cm+1}),false)
    const weights=bodyMorphWeights(localParameters(next))
    assert.ok(Object.values(weights).every(value=>Number.isFinite(value)&&Math.abs(value)<=1))
  }
  assert.equal(current.waist_circumference_cm,80)
})
