import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {Group,Raycaster,Texture,Triangle,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createProductAppearance} from './productAppearance.js'
import {logoSurfacePoint,logoContainsPoint,draggedLogoPlacement} from './logoDrag.js'
import {PRINT_AREA} from './productDesign.js'
import {validateSizeTable,selectProductSize,SAMPLE_SIZE_ROWS} from './productSizing.js'

const design={texture:new Texture(),aspect:2,placement:{x:0,y:1.22,width:.18}}

test('drag keeps grab offset, print aspect and width; clamps to the supported front area',()=>{
  const start={x:.025,y:1.24}
  assert.ok(logoContainsPoint(design,start))
  assert.equal(logoContainsPoint(design,{x:.2,y:1.24}),false)
  const same=draggedLogoPlacement(design,start,start)
  assert.equal(same.x,0);assert.equal(same.y,1.22)
  const moved=draggedLogoPlacement(design,start,{x:.045,y:1.22})
  assert.ok(Math.abs(moved.x-.02)<1e-9);assert.ok(Math.abs(moved.y-1.20)<1e-9)
  const edge=draggedLogoPlacement(design,start,{x:10,y:-10})
  assert.ok(edge.x+edge.width/2<=PRINT_AREA.right+1e-9)
  assert.ok(edge.y-edge.height/2>=PRINT_AREA.bottom-1e-9)
  assert.equal(edge.width,.18);assert.equal(edge.width/edge.height,2)
})

test('real sized/morphed GLB hit maps through rotated/scaled parents to the shader rest coordinates; back faces are rejected',async()=>{
  const bytes=await readFile(new URL('../../../public/models/ONFIT_TShirt_BodyMorph_v5.glb',import.meta.url))
  const loader=new GLTFLoader().register(()=>({name:'TextureStub',loadTexture:()=>Promise.resolve(new Texture())}))
  const {scene}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
  let mesh;scene.traverse(object=>{if(object.isMesh)mesh=object})
  const appearance=createProductAppearance(scene);appearance.setDesign(design)
  const table=validateSizeTable('test:drag',SAMPLE_SIZE_ROWS,{type:'sample'},'M')
  appearance.setSize(selectProductSize(table,'L'))
  mesh.morphTargetInfluences[mesh.morphTargetDictionary.garment_abdomen_front]=.4
  mesh.morphTargetInfluences[mesh.morphTargetDictionary.garment_shoulder_width]=.2
  const parent=new Group();parent.rotation.set(.03,.7,0);parent.scale.setScalar(.87);parent.position.set(.2,-.1,.1);parent.add(scene)
  parent.updateWorldMatrix(true,true)
  const geometry=mesh.geometry,index=geometry.index,front=geometry.attributes.onfitPrintFront,rest=geometry.attributes.onfitPrintPosition
  const findFace=predicate=>{
    for(let i=0;i<index.count;i+=3){const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)]
      const vertices=ids.map(id=>mesh.getVertexPosition(id,new Vector3()))
      if(predicate(ids)&&new Triangle(...vertices).getArea()>1e-7)return {a:ids[0],b:ids[1],c:ids[2]}
    }
    throw new Error('Expected a real shirt triangle')
  }
  const face=findFace(ids=>ids.every(id=>front.getX(id)>.8&&rest.getY(id)>1.16&&rest.getY(id)<1.30&&Math.abs(rest.getX(id))<.08))
  const ids=[face.a,face.b,face.c],weights=[.2,.3,.5]
  const local=new Vector3(),expected=new Vector3()
  ids.forEach((id,i)=>{local.addScaledVector(mesh.getVertexPosition(id,new Vector3()),weights[i]);expected.addScaledVector(new Vector3().fromBufferAttribute(rest,id),weights[i])})
  const point=mesh.localToWorld(local.clone()),mapped=logoSurfacePoint({object:mesh,face,point})
  assert.ok(mapped.distanceTo(expected)<1e-7)
  const vertices=ids.map(id=>mesh.getVertexPosition(id,new Vector3()))
  const normal=new Triangle(...vertices).getNormal(new Vector3()).transformDirection(mesh.matrixWorld)
  const ray=new Raycaster(point.clone().addScaledVector(normal,.1),normal.clone().negate())
  const hit=ray.intersectObject(mesh,false).find(hit=>logoSurfacePoint(hit))
  assert.ok(hit,'actual raycaster must hit the morphed shirt')
  assert.ok(logoSurfacePoint(hit).distanceTo(expected)<1e-5)
  const back=findFace(ids=>ids.every(id=>front.getX(id)===0))
  const backPoint=mesh.localToWorld(mesh.getVertexPosition(back.a,new Vector3()))
  assert.equal(logoSurfacePoint({object:mesh,face:back,point:backPoint}),null)
  assert.equal(logoSurfacePoint({object:mesh,point}),null)
  appearance.dispose()
})
