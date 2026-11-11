import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { PRODUCT_TEMPLATES, USER_PHOTO_REFERENCE, validateShopProduct, sampleProductReference, safeProductUrl, planProductFitting } from './productFitting.js'
import { createModelAppearance } from './garmentAppearance.js'
import { captureMorphWeights } from './glbGeometry.js'
import { applyGarmentMorphs, loadGarmentAsset, disposeGarmentAsset } from './garmentGlb.js'
// Read the actual shared catalog without modifying its Vite-specific env access.
const apiSource=await readFile(new URL('../../services/api.js',import.meta.url),'utf8')
const {mockProducts}=await import('data:text/javascript;base64,'+Buffer.from(apiSource.replaceAll('import.meta.env.VITE_API_BASE_URL','undefined')).toString('base64'))

const form={productId:'001-SKU',name:'입력 검증용 가상 메타데이터',seller:'테스트 판매처',purchaseUrl:'https://example.com/item/001-SKU',frontImage:'https://example.com/front.jpg',backImage:'https://example.com/back.jpg',category:'short_sleeve',colorHex:'#16181D',sizes:'S, M, L',sizeChart:'M: 가슴 단면 50cm (테스트 입력)',imageUseConfirmed:true}

test('product identity and optional back/size metadata are preserved without claiming seller verification',()=>{
  const product=validateShopProduct(form)
  assert.equal(product.productId,'001-SKU');assert.equal(product.name,form.name);assert.equal(product.seller,form.seller)
  assert.equal(product.purchaseUrl,form.purchaseUrl);assert.equal(product.frontImage,form.frontImage);assert.equal(product.backImage,form.backImage)
  assert.deepEqual(product.sizes,['S','M','L']);assert.equal(product.sizeChart,form.sizeChart)
  assert.equal(product.dataSource,'user_entered');assert.match(product.verification,/미완료/)
  const minimal=validateShopProduct({...form,backImage:'',colorHex:'',sizes:'',sizeChart:''})
  assert.equal(minimal.backImage,null);assert.equal(minimal.colorHex,null);assert.equal(minimal.sizeChart,null)
  assert.equal(planProductFitting(minimal).color,'#808080');assert.equal(planProductFitting(minimal).colorApplied,false)
})

test('unsafe links, missing identity, unconfirmed rights, malformed colors and unsupported categories are rejected',()=>{
  for(const change of [{productId:''},{seller:''},{name:''},{purchaseUrl:'javascript:alert(1)'},{purchaseUrl:'https://user:password@example.com/'},{frontImage:'data:image/svg+xml,evil'},{backImage:'file:///private.png'},{imageUseConfirmed:false},{colorHex:'red'},{category:'bag'}])assert.throws(()=>validateShopProduct({...form,...change}))
  assert.equal(safeProductUrl('//external.example/x',{image:true}),null)
  assert.equal(safeProductUrl('/textures/nike-shirt-reference.png',{image:true}),'/textures/nike-shirt-reference.png')
  assert.equal(safeProductUrl('http://example.com/x'),null)
  for(const category of ['toString','constructor','__proto__']){
    assert.throws(()=>validateShopProduct({...form,category}))
    assert.equal(planProductFitting({...form,category}).supported,false)
  }
})

test('existing product list stays read-only sample data and reference photo has no invented seller/product ID',()=>{
  const before=JSON.stringify(mockProducts)
  for(const product of mockProducts){const reference=sampleProductReference(product);assert.equal(reference.productId,product.id);assert.equal(reference.frontImage,product.image);assert.equal(reference.dataSource,'sample');assert.equal(planProductFitting(reference).supported,false)}
  assert.equal(JSON.stringify(mockProducts),before)
  assert.equal(USER_PHOTO_REFERENCE.productId,null);assert.equal(USER_PHOTO_REFERENCE.purchaseUrl,null);assert.equal(USER_PHOTO_REFERENCE.seller,null)
  const plan=planProductFitting(USER_PHOTO_REFERENCE)
  assert.equal(plan.category,'short_sleeve');assert.equal(plan.logoApplied,false);assert.equal(plan.patternApplied,false)
  assert.match(USER_PHOTO_REFERENCE.verification,/미확인/)
})

const loader=()=>new GLTFLoader().register(()=>({name:'NodeTextureDecodeStub',loadTexture:()=>Promise.resolve(new Texture())}))
const mesh=scene=>{let result;scene.traverse(o=>{if(o.isMesh)result=o});return result}
for(const [category,template]of Object.entries(PRODUCT_TEMPLATES))test(`${category}: actual template retains UV/real morph positions and product tint has no inherited logo`,async()=>{
  const plan=planProductFitting(validateShopProduct({...form,category}))
  assert.equal(plan.model,template.model);assert.equal(plan.slot,template.slot)
  const bytes=await readFile(new URL('../../../public'+plan.model.url,import.meta.url))
  const gltf=await loader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
  const m=mesh(gltf.scene),geometry=m.geometry,material=m.material,positions=geometry.attributes.position.array.slice(),uv=geometry.attributes.uv.array.slice()
  assert.ok(uv.length>0)
  const appearance=createModelAppearance(gltf.scene,plan.model)
  appearance.setColor(plan.color)
  assert.notEqual(m.material,material);assert.equal(m.material.color.getHexString(),'16181d')
  assert.equal(m.material.map,null);assert.equal(m.material.normalMap,null)
  assert.equal(material.map!==null,true,'Original authored texture remains on the original material')
  assert.equal(m.geometry,geometry);assert.deepEqual(geometry.attributes.position.array,positions);assert.deepEqual(geometry.attributes.uv.array,uv)
  const before=m.getVertexPosition(100,new Vector3()).clone(),defaults=captureMorphWeights(gltf.scene)
  if(category!=='cap'){
    const key=category==='pants'?'pelvis_width':'abdomen_front'
    assert.ok(m.morphTargetDictionary['garment_'+key]!==undefined)
    applyGarmentMorphs(gltf.scene,defaults,{[key]:.8},plan.model.url)
    const index=m.morphTargetDictionary['garment_'+key];assert.equal(m.morphTargetInfluences[index],.8)
    let changedIndex=-1
    for(let i=0;i<geometry.attributes.position.count;i++)if(m.geometry.morphAttributes.position[index].getX(i)!==0||m.geometry.morphAttributes.position[index].getY(i)!==0||m.geometry.morphAttributes.position[index].getZ(i)!==0){changedIndex=i;break}
    assert.ok(changedIndex>=0)
    const changed=m.getVertexPosition(changedIndex,new Vector3())
    const base=new Vector3().fromBufferAttribute(geometry.attributes.position,changedIndex)
    assert.ok(changed.distanceTo(base)>1e-8,'Actual Three.js vertex evaluation must change')
    applyGarmentMorphs(gltf.scene,defaults,{},plan.model.url)
    assert.deepEqual(m.getVertexPosition(100,new Vector3()),before)
  }else assert.equal(m.geometry.morphAttributes.position,undefined)
  appearance.dispose();assert.equal(m.material,material)
})

test('missing/corrupt GLB fail without a successful fallback; product color change needs no refetch',async()=>{
  const model=PRODUCT_TEMPLATES.short_sleeve.model
  await assert.rejects(loadGarmentAsset(model.url,{fetcher:async()=>({ok:false,status:404})}),error=>error.kind==='missing')
  await assert.rejects(loadGarmentAsset(model.url,{fetcher:async()=>({ok:true,status:200,arrayBuffer:async()=>new ArrayBuffer(20)})}),error=>error.kind==='error')
  const bytes=await readFile(new URL('../../../public'+model.url,import.meta.url));let requests=0
  const result=await loadGarmentAsset(model.url,{loader:loader(),fetcher:async()=>{requests++;return{ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}}})
  const appearance=createModelAppearance(result.scene,model)
  for(const hex of ['#16181D','#1B2944','#C8B89D'])appearance.setColor(hex)
  assert.equal(requests,1)
  appearance.dispose();disposeGarmentAsset(result.asset)
})
