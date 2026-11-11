// Export actual Three.js evaluated sample states for independent Blender QA.
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {Texture,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {SAMPLE_SIZE_ROWS,validateSizeTable,selectProductSize} from '../src/components/fitting/productSizing.js'
import {PRODUCT_TEMPLATES} from '../src/components/fitting/productFitting.js'
import {createModelAppearance} from '../src/components/fitting/garmentAppearance.js'
import {captureMorphWeights} from '../src/components/fitting/glbGeometry.js'
import {applyGarmentMorphs} from '../src/components/fitting/garmentGlb.js'
import {applyBodyMorphs,bodyMorphWeights,BODY_MORPH_MODEL_URL} from '../src/components/fitting/bodyMorphs.js'
const calibrated=process.argv.includes('--calibrated')
const quality=process.argv.includes('--quality')||calibrated
const label=process.argv.includes('--label')?process.argv[process.argv.indexOf('--label')+1]:calibrated?'product_sizes_v3':quality?'product_sizes_v2':'product_sizes_v1'
const out=new URL('../../assets/blender/previews/'+label+'/',import.meta.url)
await mkdir(out,{recursive:true})
const loader=new GLTFLoader().register(()=>({name:'NodeTextureDecodeStub',loadTexture:()=>Promise.resolve(new Texture())}))
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),sourceHashes={}
async function load(name){const bytes=await readFile(new URL('../public/models/'+name,import.meta.url));sourceHashes[name]=hash(bytes);return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')}
const body=await load('ONFIT_Human_BodyMorph_v3.glb'),tee=await load('ONFIT_TShirt_BodyMorph_v5.glb')
const mesh=scene=>{let m;scene.traverse(o=>{if(o.isMesh)m=o});return m}
const t=mesh(tee.scene),b=mesh(body.scene),defaults=captureMorphWeights(tee.scene),bodyDefaults=captureMorphWeights(body.scene)
const appearance=createModelAppearance(tee.scene,PRODUCT_TEMPLATES.short_sleeve.model)
const table=validateSizeTable('sample:qa',SAMPLE_SIZE_ROWS,{type:'sample'},'M')
const base={shoulder_width_m:.42,chest_radius_m:.95/(2*Math.PI),waist_radius_m:.80/(2*Math.PI),abdomen_protrusion_m:0,pelvis_width_m:.30}
const states=[],buffers=[];let offset=0
function points(m){const a=new Float32Array(m.geometry.attributes.position.count*3);for(let i=0;i<a.length/3;i++)m.getVertexPosition(i,new Vector3()).toArray(a,i*3);return a}
const cases=quality?[
  ['S_base','S',{}],['S_abdomen_max','S',{abdomen_protrusion_m:.20}],['S_chest_max','S',{chest_radius_m:1.8/(2*Math.PI)}],
  ['M_base','M',{}],['L_base','L',{}],['XL_base','XL',{}],['XL_shoulder_max','XL',{shoulder_width_m:.65}],['XL_abdomen_max','XL',{abdomen_protrusion_m:.20}],
]:[false,true].flatMap(extreme=>['S','M','L','XL'].map(name=>[`${name}_${extreme?'abdomen_max_pelvis_min':'base'}`,name,extreme?{abdomen_protrusion_m:.20,pelvis_width_m:.20}:{}]))
for(const [caseName,name,override]of cases){
  const parameters={...base,...override},weights=bodyMorphWeights(parameters)
  const state={name:caseName,sample:true,size:name,extreme:Object.keys(override).length>0}
  if(quality){
    appearance.setSize(selectProductSize(table,'M'));applyGarmentMorphs(tee.scene,defaults,calibrated?null:weights,PRODUCT_TEMPLATES.short_sleeve.model.url)
    const a=points(t);state.referenceTee={offset,count:a.length/3};buffers.push(Buffer.from(a.buffer));offset+=a.byteLength
  }
  appearance.setSize(selectProductSize(table,name))
  applyGarmentMorphs(tee.scene,defaults,calibrated?null:weights,PRODUCT_TEMPLATES.short_sleeve.model.url)
  applyBodyMorphs(body.scene,bodyDefaults,parameters,BODY_MORPH_MODEL_URL)
  if(quality)state.measurements=appearance.measureSize(selectProductSize(table,name))
  for(const [slot,m]of [['body',b],['tee',t]]){const a=points(m);state[slot]={offset,count:a.length/3};const bytes=Buffer.from(a.buffer);buffers.push(bytes);offset+=bytes.length}
  states.push(state)
}
appearance.dispose()
await writeFile(new URL('states.bin',out),Buffer.concat(buffers),{flag:'wx'})
await writeFile(new URL('states.json',out),JSON.stringify({sourceHashes,states,table,calibrated,note:calibrated?'UI samples; declared geometric proxies fitted numerically, vendor measurement method unverified; product morph weights fixed.':'UI sample measurements only; source GLB absolute dimensions are not calibrated to reference M.'},null,2),{flag:'wx'})
console.log(JSON.stringify({states:states.length,bytes:offset,sourceHashes}))
