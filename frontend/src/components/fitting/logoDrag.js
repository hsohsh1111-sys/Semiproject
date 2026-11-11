import { Triangle, Vector3 } from 'three'
import { printPlacement } from './productDesign.js'

// Raycasts hit morphed vertices; shader ink uses resized REST coordinates.
// Barycentric interpolation maps the hit back to that same print coordinate.
export function logoSurfacePoint(hit) {
  const mesh=hit?.object,face=hit?.face
  const rest=mesh?.geometry?.attributes.onfitPrintPosition
  const front=mesh?.geometry?.attributes.onfitPrintFront
  if(!mesh?.isMesh||!face||!rest||!front||!hit.point)return null
  const ids=[face.a,face.b,face.c]
  const vertices=ids.map(index=>mesh.getVertexPosition(index,new Vector3()))
  const local=mesh.worldToLocal(hit.point.clone())
  const bary=new Triangle(...vertices).getBarycoord(local,new Vector3())
  if(!bary)return null
  const weights=bary.toArray()
  if(weights.some(value=>!Number.isFinite(value)||value<-.001))return null
  if(ids.reduce((sum,index,i)=>sum+front.getX(index)*weights[i],0)<=.01)return null
  const point=new Vector3()
  ids.forEach((index,i)=>point.addScaledVector(new Vector3().fromBufferAttribute(rest,index),weights[i]))
  return point
}

export function logoContainsPoint(design,point) {
  if(!design||!point)return false
  const p=printPlacement(design.placement,design.aspect)
  return Math.abs(point.x-p.x)<=p.width/2&&Math.abs(point.y-p.y)<=p.height/2
}

export function draggedLogoPlacement(design,start,point) {
  const p=printPlacement(design.placement,design.aspect)
  return printPlacement({...p,x:p.x+point.x-start.x,y:p.y+point.y-start.y},design.aspect)
}
