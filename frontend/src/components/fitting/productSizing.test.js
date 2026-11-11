import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {Texture,Vector3,ShaderLib} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {SAMPLE_SIZE_ROWS,validateSizeTable,selectProductSize,compareProductSize,sizePosition,calibrateProductSize,garmentWeightsForProductSize} from './productSizing.js'
import {PRODUCT_TEMPLATES} from './productFitting.js'
import {createModelAppearance} from './garmentAppearance.js'
import {applyGarmentMorphs} from './garmentGlb.js'
import {captureMorphWeights} from './glbGeometry.js'
import {tshirtLandmarks,measureTshirt} from './tshirtMeasurements.js'

const table=validateSizeTable('local:test',SAMPLE_SIZE_ROWS,{type:'sample'},'M')
test('size identity/source and optional missing sleeve are preserved; sample rows are never seller data',()=>{
  assert.match(table.source.label,/샘플/);assert.equal(table.source.url,null);assert.equal(table.productKey,'local:test')
  const actual=validateSizeTable('sku:1',[{name:'95',shoulder:'43',chestFlat:'51',length:'67',sleeve:''}],{type:'seller',url:'https://example.com/size',confirmed:true},'95')
  assert.equal(actual.rows[0].sleeve,null);assert.equal(selectProductSize(actual,'95').sleeveSupported,false)
  assert.equal(actual.source.url,'https://example.com/size');assert.match(actual.source.label,/미완료/)
})
test('missing/duplicate dimensions and unsafe provenance fail; unsupported targets remain intact for explicit calibration failure',()=>{
  for(const rows of [[{...SAMPLE_SIZE_ROWS[0],shoulder:''}],[SAMPLE_SIZE_ROWS[0],{...SAMPLE_SIZE_ROWS[0],name:'s'}],[{...SAMPLE_SIZE_ROWS[0],length:-1}]])assert.throws(()=>validateSizeTable('p',rows,{type:'sample'},'S'))
  assert.throws(()=>validateSizeTable('p',SAMPLE_SIZE_ROWS,{type:'seller',url:'javascript:x',confirmed:true},'M'))
  assert.throws(()=>validateSizeTable('p',SAMPLE_SIZE_ROWS,{type:'seller',url:'https://example.com'},'M'))
  assert.throws(()=>selectProductSize(table,'XXL'))
  const wide=validateSizeTable('p',[SAMPLE_SIZE_ROWS[1],{...SAMPLE_SIZE_ROWS[1],name:'Custom',shoulder:70}],{type:'sample'},'M')
  assert.equal(selectProductSize(wide,'Custom').row.shoulder,70)
})
test('comparisons use flat chest ×2 and displayed differences only, not recommendations',()=>{
  assert.deepEqual(compareProductSize(selectProductSize(table,'M'),{shoulder_width_cm:42,chest_circumference_cm:95}),{shoulderDifferenceCm:2,chestEaseCm:9,garmentChestApproxCm:104,lengthDifferenceCm:0})
  assert.equal(compareProductSize(selectProductSize(table,'L'),{shoulder_width_cm:'',chest_circumference_cm:''}).chestEaseCm,null)
})
const bytes=await readFile(new URL('../../../public/models/ONFIT_TShirt_BodyMorph_v5.glb',import.meta.url))
const loader=new GLTFLoader().register(()=>({name:'NodeTextureDecodeStub',loadTexture:()=>Promise.resolve(new Texture())}))
const asset=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
const mesh=scene=>{let m;scene.traverse(o=>{if(o.isMesh)m=o});return m}
const coords=m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,new Vector3()).toArray())

test('shoulder/chest/length/sleeve fields affect separate garment zones instead of globally scaling',()=>{
  const zero={shoulder:0,chest:0,length:0,sleeve:0}
  assert.deepEqual(sizePosition(0,1.45,.1,{...zero,shoulder:.04}),[0,1.45,.1])
  assert.ok(sizePosition(.3,1.35,0,{...zero,shoulder:.04})[0]>.3)
  assert.ok(sizePosition(.13,1.2,.1,{...zero,chest:.04})[0]>.13)
  assert.equal(sizePosition(.3,1.3,0,{...zero,chest:.04})[0],.3)
  assert.ok(sizePosition(.1,.95,.1,{...zero,length:.04})[1]<.95)
  assert.deepEqual(sizePosition(.3,1.35,0,{...zero,length:.04}),[.3,1.35,0])
  assert.ok(sizePosition(.35,1.27,0,{...zero,sleeve:.02})[0]>.35)
  assert.deepEqual(sizePosition(.1,1.2,.1,{...zero,sleeve:.02}),[.1,1.2,.1])
})
test('actual S/M/L/XL are fitted to nominal proxy targets; reference restores calibrated M and removal restores the source',()=>{
  const scene=asset.scene.clone(true),m=mesh(scene),original=m.geometry,appearance=createModelAppearance(scene,PRODUCT_TEMPLATES.short_sleeve.model)
  const defaults=captureMorphWeights(scene)
  applyGarmentMorphs(scene,defaults,null,PRODUCT_TEMPLATES.short_sleeve.model.url)
  appearance.setSize(selectProductSize(table,'M'))
  const weights=m.morphTargetInfluences.slice(),baseline=coords(m)
  for(const name of ['S','L','XL']){
    appearance.setSize(selectProductSize(table,name))
    assert.notEqual(m.geometry,original);assert.deepEqual(m.morphTargetInfluences,weights)
    const actual=coords(m);assert.ok(actual.some((p,i)=>Math.hypot(...p.map((v,a)=>v-baseline[i][a]))>.005))
    assert.deepEqual(m.geometry.index.array,original.index.array);assert.deepEqual(m.geometry.attributes.uv.array,original.attributes.uv.array)
    assert.deepEqual(m.geometry.morphAttributes.position.map(a=>a.array),original.morphAttributes.position.map(a=>a.array))
    assert.deepEqual(m.geometry.attributes.onfitPrintPosition.array,m.geometry.attributes.position.array)
    assert.ok(Object.values(appearance.measureSize(selectProductSize(table,name)).errors).every(value=>Math.abs(value)<.05))
  }
  appearance.setSize(selectProductSize(table,'M'))
  assert.deepEqual(coords(m),baseline);assert.deepEqual(m.morphTargetInfluences,weights)
  appearance.setSize(null)
  assert.deepEqual(m.geometry.attributes.position.array,original.attributes.position.array)
  assert.deepEqual(m.geometry.attributes.normal.array,original.attributes.normal.array)
  appearance.dispose();assert.equal(m.geometry,original)
})
test('size changes keep the same print texture, aspect/uniforms and cloned material; applying print after size keeps offsets',()=>{
  const scene=asset.scene.clone(true),m=mesh(scene),appearance=createModelAppearance(scene,PRODUCT_TEMPLATES.short_sleeve.model),texture=new Texture()
  appearance.setSize(selectProductSize(table,'L'));const geometry=m.geometry,position=m.geometry.attributes.position.array.slice()
  appearance.setDesign({texture,aspect:2,placement:{x:0,y:1.22,width:.18}})
  const material=m.material,shader={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader}
  material.onBeforeCompile(shader)
  assert.deepEqual(geometry.attributes.position.array,position)
  appearance.setSize(selectProductSize(table,'XL'))
  assert.equal(m.geometry,geometry);assert.equal(m.material,material);assert.equal(shader.uniforms.onfitDesign.value,texture)
  assert.equal(shader.uniforms.onfitPrintRect.value.z/shader.uniforms.onfitPrintRect.value.w,2)
  appearance.setSize(null);assert.deepEqual(geometry.attributes.position.array,mesh(asset.scene).geometry.attributes.position.array)
  assert.equal(shader.uniforms.onfitDesignEnabled.value,1)
  appearance.dispose()
})
test('independent triangle QA records fitted proxies, no flips/self crossings and disclosed body contacts',async()=>{
  const report=JSON.parse(await readFile(new URL('../../../../assets/blender/previews/product_sizes_v3_final/validation.json',import.meta.url),'utf8'))
  assert.equal(report.sample_only,true);assert.equal(report.absolute_dimensions_calibrated,false);assert.equal(report.browser_verified,false)
  assert.equal(report.checks.length,8)
  for(const check of report.checks){assert.equal(check.size_induced_normal_reversals,0,check.name);assert.equal(check.self_overlap_pairs,0,check.name);assert.ok(Number.isInteger(check.body_overlap_pairs))}
  assert.equal(report.proxy_targets_calibrated,true)
  for(const check of report.checks)assert.ok(Object.values(check.measurements.errors).every(value=>Math.abs(value)<.05))
})
test('measurement proxies use stable landmarks and one closed material ring, not bounding-box dimensions',()=>{
  const geometry=mesh(asset.scene).geometry,landmarks=tshirtLandmarks(geometry),m=measureTshirt(geometry,landmarks)
  assert.equal(landmarks.chestRingClosed,true)
  assert.ok(Math.abs(m.shoulder-36.4527)<.001);assert.ok(Math.abs(m.chestFlat-45.1801)<.001)
  assert.ok(Math.abs(m.length-58.3346)<.001);assert.ok(Math.abs(m.sleeve-17.0460)<.001)
  assert.ok(m.shoulder<50,'Whole shirt bbox including cuffs must not be called shoulder width')
})
test('body morph input never changes sized product nominal dimensions; unclothed/template morph behavior remains available',()=>{
  const scene=asset.scene.clone(true),m=mesh(scene),appearance=createModelAppearance(scene,PRODUCT_TEMPLATES.short_sleeve.model),size=selectProductSize(table,'M')
  appearance.setSize(size)
  const measured=appearance.measureSize(size)
  assert.ok(Object.values(measured.errors).every(value=>Math.abs(value)<.05))
  const defaults=captureMorphWeights(scene)
  const weights={chest_volume:1,abdomen_front:.8,shoulder_width:1}
  applyGarmentMorphs(scene,defaults,garmentWeightsForProductSize(size,PRODUCT_TEMPLATES.short_sleeve.model,weights),PRODUCT_TEMPLATES.short_sleeve.model.url)
  const after=appearance.measureSize(size)
  assert.deepEqual(after.measured,measured.measured)
  assert.equal(garmentWeightsForProductSize(null,PRODUCT_TEMPLATES.short_sleeve.model,weights),weights)
  assert.match(after.method,/추정치/)
  appearance.dispose()
})
test('nominal fitting is reference-row independent and missing sleeve preserves source geometric length without invented chart values',()=>{
  const source=mesh(asset.scene).geometry,a=calibrateProductSize(source,table.rows[2])
  const other=validateSizeTable('local:test',SAMPLE_SIZE_ROWS,{type:'sample'},'S')
  const b=calibrateProductSize(source,selectProductSize(other,'L').row)
  assert.deepEqual(a.delta,b.delta)
  const row={...table.rows[1],sleeve:null},c=calibrateProductSize(source,row)
  assert.equal(row.sleeve,null);assert.equal(c.converged,true)
  assert.ok(Math.abs(c.measured.sleeve-measureTshirt(source,tshirtLandmarks(source)).sleeve)<.05)
  assert.equal(calibrateProductSize(source,{...table.rows[1],shoulder:70}).converged,false)
})
