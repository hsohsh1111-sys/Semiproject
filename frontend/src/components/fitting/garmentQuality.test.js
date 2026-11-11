import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { PANTS_GLB, TSHIRT_MORPH_GLB, applyGarmentMorphs } from './garmentGlb.js'
import { captureMorphWeights } from './glbGeometry.js'
import { bodyMorphWeights } from './bodyMorphs.js'
import { createModelAppearance, GARMENT_COLORS } from './garmentAppearance.js'

const folder=new URL('../../../public/models/',import.meta.url)
const read=name=>readFile(new URL(name,folder))
const report=JSON.parse(await readFile(new URL('../../../../assets/blender/garment_quality_v5_v2.json',import.meta.url),'utf8'))
async function load(name){const b=await read(name);return new GLTFLoader().register(()=>({name:'NodeTextureDecodeStub',loadTexture:()=>Promise.resolve(new Texture())})).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')}
const mesh=s=>{let m;s.traverse(o=>{if(o.isMesh)m=o});return m}
const near=(a,b,t=2e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`)
const models={top:['ONFIT_TShirt_BodyMorph_v4.glb','ONFIT_TShirt_BodyMorph_v5.glb',TSHIRT_MORPH_GLB],bottom:['ONFIT_Pants_BodyMorph_v1.glb','ONFIT_Pants_BodyMorph_v2.glb',PANTS_GLB]}
const instances={}
for(const [slot,[oldName,newName,descriptor]]of Object.entries(models)){
  const before=await load(oldName),after=await load(newName)
  instances[slot]={before,after,descriptor}
  test(`${slot}: exact base geometry, topology, UVs, materials, textures, target names/defaults and source hashes preserved`,async()=>{
    const a=mesh(before.scene),b=mesh(after.scene)
    for(const attr of ['position','uv'])assert.deepEqual(b.geometry.attributes[attr].array,a.geometry.attributes[attr].array)
    assert.deepEqual(b.geometry.index.array,a.geometry.index.array)
    assert.deepEqual(b.morphTargetDictionary,a.morphTargetDictionary)
    assert.deepEqual(b.morphTargetInfluences,a.morphTargetInfluences)
    const raw=await read(oldName),next=await read(newName)
    const extract=buf=>{const n=buf.readUInt32LE(12);return buf.subarray(28+n,28+n+buf.readUInt32LE(20+n))}
    const binary=extract(raw);assert.ok(extract(next).subarray(0,binary.length).equals(binary))
    const doc=buf=>JSON.parse(buf.subarray(20,20+buf.readUInt32LE(12)))
    for(const field of ['materials','textures','images','samplers'])assert.deepEqual(doc(next)[field],doc(raw)[field])
    for(const [p,hash]of Object.entries(report.source_hashes))assert.equal(createHash('sha256').update(await readFile(p)).digest('hex'),hash)
    assert.equal(createHash('sha256').update(next).digest('hex'),report.output_hashes[slot])
  })
  test(`${slot}: locally refined displacement fields stay within 0.45mm; UV-split smooth normals agree`,()=>{
    const a=mesh(before.scene),b=mesh(after.scene),p=b.geometry.attributes.position,n=b.geometry.attributes.normal
    const seen=new Map()
    for(let i=0;i<p.count;i++){
      const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(6)).join(',')
      const normal=[n.getX(i),n.getY(i),n.getZ(i)]
      near(Math.hypot(...normal),1)
      if(seen.has(key))normal.forEach((v,axis)=>near(v,seen.get(key)[axis]));else seen.set(key,normal)
    }
    for(let k=0;k<b.geometry.morphAttributes.position.length;k++){
      const old=a.geometry.morphAttributes.position[k].array,now=b.geometry.morphAttributes.position[k].array
      let changed=0
      for(let i=0;i<now.length;i+=3){
        const d=Math.hypot(now[i]-old[i],now[i+1]-old[i+1],now[i+2]-old[i+2])
        assert.ok(d<=.000451);if(d>1e-7)changed++
      }
      assert.ok(changed>10)
    }
    assert.ok(report.analysis[slot].normal_seams_before.vertices_over_5_degrees>0)
    assert.equal(report.analysis[slot].normal_seams_after.vertices_over_5_degrees,0)
    for(const stats of Object.values(report.analysis[slot].morphs))assert.ok(stats.laplacian_rms_after<stats.laplacian_rms_before)
  })
  test(`${slot}: actual new GLB supports signed vertices, combined weights, colors and exact default restoration`,()=>{
    const scene=after.scene.clone(true),m=mesh(scene),defaults=captureMorphWeights(scene)
    const positions=()=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,new Vector3()).toArray())
    const original=positions()
    const appearance=createModelAppearance(scene,descriptor)
    const weights=bodyMorphWeights({waist_radius_m:.45/(2*Math.PI),hip_radius_m:1.8/(2*Math.PI),pelvis_width_m:.6,thigh_radius_m:1/(2*Math.PI),abdomen_protrusion_m:.2,shoulder_width_m:.65,chest_radius_m:1.8/(2*Math.PI)})
    applyGarmentMorphs(scene,defaults,weights,descriptor.url)
    const deformed=positions();assert.notDeepEqual(deformed,original)
    for(const [name,index]of Object.entries(m.morphTargetDictionary))near(m.morphTargetInfluences[index],weights[name.replace('garment_','')])
    for(const color of GARMENT_COLORS){appearance?.setColor(color.id);assert.deepEqual(positions(),deformed)}
    const base=m.geometry.attributes.position.array
    deformed.forEach((p,i)=>p.forEach((v,axis)=>{
      let expected=base[i*3+axis]
      m.morphTargetInfluences.forEach((weight,k)=>expected+=weight*m.geometry.morphAttributes.position[k].array[i*3+axis])
      near(v,expected)
    }))
    applyGarmentMorphs(scene,defaults,null,descriptor.url)
    assert.deepEqual(positions(),original)
    appearance?.dispose()
  })
}

test('34 matched before/after states introduce no new collisions or folds; known shoulder/pants overlap remains explicit',()=>{
  assert.equal(report.checks.length,68)
  let preexisting=0
  for(let i=0;i<report.checks.length;i+=2){
    const old=report.checks[i],now=report.checks[i+1]
    assert.equal(now.state,old.state)
    assert.ok(now.top_bottom_overlap_pairs<=old.top_bottom_overlap_pairs)
    for(const slot of ['top','bottom']){
      for(const metric of ['body_overlap_pairs','self_overlap_pairs','flipped_triangles'])assert.ok(now[slot][metric]<=old[slot][metric],`${now.state} ${slot} ${metric}`)
      assert.equal(now[slot].self_overlap_pairs,0)
      assert.equal(now[slot].flipped_triangles,0)
      preexisting+=old[slot].body_overlap_pairs
    }
  }
  assert.ok(preexisting>0,'Do not claim all states collision-free')
  assert.deepEqual(report.checks[0].weights,report.checks[10].weights)
})
