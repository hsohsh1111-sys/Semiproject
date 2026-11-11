import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Texture, Vector3, ShaderLib, SRGBColorSpace } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { cropPixels, printPlacement, PRINT_AREA } from './productDesign.js'
import { PRODUCT_TEMPLATES } from './productFitting.js'
import { createModelAppearance } from './garmentAppearance.js'
import { applyGarmentMorphs } from './garmentGlb.js'
import { captureMorphWeights } from './glbGeometry.js'

function photo(){const data=new Uint8ClampedArray(32*32*4);for(let i=0;i<data.length;i+=4)data.set([22,24,29,255],i);for(let y=12;y<20;y++)for(let x=12;x<20;x++)data.set(x<16?[255,255,255,255]:[30,80,200,255],(y*32+x)*4);return data}
test('manual crop preserves source orientation/aspect and leaves only selected pixels, not the whole photo',()=>{
  const data=photo(),before=data.slice(),crop=cropPixels(data,32,32,{x:.25,y:.25,w:.5,h:.5})
  assert.equal(crop.width,16);assert.equal(crop.height,16);assert.equal(crop.aspect,1)
  assert.deepEqual(crop.data.slice((4*16+4)*4,(4*16+5)*4),new Uint8ClampedArray([255,255,255,255]))
  assert.deepEqual(crop.data.slice((4*16+8)*4,(4*16+9)*4),new Uint8ClampedArray([30,80,200,255]))
  assert.deepEqual(data,before)
})
test('optional color key removes cloth color, retains contrasting white/blue ink, and rejects empty/invalid crops',()=>{
  const crop=cropPixels(photo(),32,32,{x:.25,y:.25,w:.5,h:.5},{removeBackground:true,background:'#16181D',tolerance:45})
  assert.equal(crop.data[3],0);assert.equal(crop.data[(4*16+4)*4+3],255);assert.equal(crop.data[(4*16+8)*4+3],255)
  for(const selection of [{x:-.1,y:0,w:.5,h:.5},{x:.9,y:0,w:.5,h:.5},{x:0,y:0,w:.01,h:.01}])assert.throws(()=>cropPixels(photo(),32,32,selection))
  assert.throws(()=>cropPixels(photo(),32,32,{x:0,y:0,w:.25,h:.25},{removeBackground:true,background:'#16181D'}),/남지/)
})
test('print placement keeps aspect ratio and limits width/height/position to the central front panel',()=>{
  for(const aspect of [.25,.5,1,2,12])for(const input of [{x:-100,y:100,width:10},{x:100,y:-100,width:.2},{x:0,y:1.22,width:.18}]){
    const p=printPlacement(input,aspect)
    assert.ok(Math.abs(p.width/p.height-aspect)<1e-10)
    assert.ok(p.x-p.width/2>=PRINT_AREA.left-1e-9&&p.x+p.width/2<=PRINT_AREA.right+1e-9)
    assert.ok(p.y-p.height/2>=PRINT_AREA.bottom-1e-9&&p.y+p.height/2<=PRINT_AREA.top+1e-9)
  }
  assert.throws(()=>printPlacement({},0));assert.throws(()=>printPlacement({},20))
})

const bytes=await readFile(new URL('../../../public/models/ONFIT_TShirt_BodyMorph_v5.glb',import.meta.url))
const loader=new GLTFLoader().register(()=>({name:'NodeTextureDecodeStub',loadTexture:()=>Promise.resolve(new Texture())}))
const asset=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
const mesh=scene=>{let m;scene.traverse(o=>{if(o.isMesh)m=o});return m}

test('actual front-only auxiliary coordinates preserve original UV/index/morph geometry and reject back/sleeve areas',()=>{
  const scene=asset.scene.clone(true),m=mesh(scene),source=m.geometry,uv=source.attributes.uv.array.slice(),material=m.material
  const appearance=createModelAppearance(scene,PRODUCT_TEMPLATES.short_sleeve.model),texture=new Texture()
  appearance.setDesign({texture,aspect:2,placement:{x:0,y:1.22,width:.18}})
  assert.notEqual(m.geometry,source);assert.deepEqual(m.geometry.attributes.uv.array,uv)
  assert.deepEqual(m.geometry.index.array,source.index.array)
  assert.deepEqual(m.geometry.attributes.position.array,source.attributes.position.array)
  assert.deepEqual(m.geometry.morphAttributes.position.map(a=>a.array),source.morphAttributes.position.map(a=>a.array))
  const p=source.attributes.position,n=source.attributes.normal,mask=m.geometry.attributes.onfitPrintFront
  let front=0,back=0
  for(let i=0;i<p.count;i++){
    if(p.getZ(i)<-.02||n.getZ(i)<0){assert.equal(mask.getX(i),0);back++}
    if(Math.abs(p.getX(i))<.1&&p.getY(i)>1.1&&p.getY(i)<1.3&&p.getZ(i)>.05&&mask.getX(i)>.9)front++
  }
  assert.ok(front>20&&back>100)
  appearance.dispose();assert.equal(m.geometry,source);assert.equal(m.material,material);assert.equal(source.attributes.onfitPrintFront,undefined)
})
test('print coordinates remain attached to the actual morphing tee while source color and other materials stay isolated',()=>{
  const scene=asset.scene.clone(true),m=mesh(scene),source=m.geometry,sourceMaterial=m.material,appearance=createModelAppearance(scene,PRODUCT_TEMPLATES.short_sleeve.model)
  appearance.setColor('#16181D')
  const texture=new Texture();texture.colorSpace=SRGBColorSpace
  appearance.setDesign({texture,aspect:2,placement:{x:0,y:1.2,width:.18}})
  const rest=m.geometry.attributes.onfitPrintPosition.array.slice(),defaults=captureMorphWeights(scene)
  const p=m.geometry.attributes.position,mask=m.geometry.attributes.onfitPrintFront
  let i=0;for(;i<p.count;i++)if(Math.abs(p.getX(i))<.06&&p.getY(i)>1.1&&p.getY(i)<1.3&&mask.getX(i)>.9)break
  assert.ok(i<p.count)
  const before=m.getVertexPosition(i,new Vector3()).clone()
  applyGarmentMorphs(scene,defaults,{abdomen_front:.8,pelvis_width:-1},PRODUCT_TEMPLATES.short_sleeve.model.url)
  assert.ok(m.getVertexPosition(i,new Vector3()).distanceTo(before)>1e-5)
  assert.deepEqual(m.geometry.attributes.onfitPrintPosition.array,rest)
  assert.equal(m.material.color.getHexString(),'16181d');assert.notEqual(m.material,sourceMaterial)
  assert.equal(source.attributes.onfitPrintPosition,undefined)
  appearance.dispose()
})
test('real Three standard shader gets separate front-only ink uniforms, with live placement/removal and no GLB refetch',()=>{
  const scene=asset.scene.clone(true),m=mesh(scene),appearance=createModelAppearance(scene,PRODUCT_TEMPLATES.short_sleeve.model),texture=new Texture()
  appearance.setDesign({texture,aspect:2,placement:{x:0,y:1.2,width:.18}})
  const shader={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader}
  m.material.onBeforeCompile(shader)
  assert.match(shader.vertexShader,/onfitRestPrint=onfitPrintPosition/)
  assert.match(shader.fragmentShader,/onfitFrontMask/);assert.match(shader.fragmentShader,/onfitPrintArea/)
  assert.match(shader.fragmentShader,/gl_FrontFacing/)
  assert.equal(shader.uniforms.onfitDesign.value,texture);assert.equal(shader.uniforms.onfitDesignEnabled.value,1)
  const geometry=m.geometry,material=m.material
  appearance.setDesign({texture,aspect:2,placement:{x:.03,y:1.25,width:.12}})
  assert.equal(m.geometry,geometry);assert.equal(m.material,material)
  assert.ok(Math.abs(shader.uniforms.onfitPrintRect.value.w-.06)<1e-9)
  appearance.setDesign(null);assert.equal(shader.uniforms.onfitDesignEnabled.value,0)
  let disposed=false;texture.addEventListener('dispose',()=>{disposed=true});appearance.dispose();assert.equal(disposed,false,'Caller owns uploaded/canvas texture lifetime')
})
