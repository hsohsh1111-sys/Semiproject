import { safeProductUrl } from './productFitting.js'
import { tshirtLandmarks,measureTshirt } from './tshirtMeasurements.js'

export const SAMPLE_SIZE_ROWS = Object.freeze([
  {name:'S',shoulder:42,chestFlat:50,length:66,sleeve:20},
  {name:'M',shoulder:44,chestFlat:52,length:68,sleeve:21},
  {name:'L',shoulder:46,chestFlat:54,length:70,sleeve:22},
  {name:'XL',shoulder:48,chestFlat:56,length:72,sleeve:23},
].map(Object.freeze)) // UI verification only; never a shop size chart.

export function validateSizeTable(productKey,rows,source,referenceName) {
  if(!productKey||!Array.isArray(rows)||rows.length<1||rows.length>16)throw new Error('상품과 1~16개 사이즈 행을 확인하세요.')
  if(!['seller','sample'].includes(source?.type))throw new Error('사이즈표 출처 유형을 선택하세요.')
  const url=source.type==='seller'?safeProductUrl(source.url):null
  if(source.type==='seller'&&(!url||!source.confirmed))throw new Error('판매처 사이즈표 HTTPS 출처와 원문 입력 확인이 필요합니다.')
  const seen=new Set()
  const normalized=rows.map(row=>{
    const name=String(row.name??'').trim()
    if(!name||name.length>30||seen.has(name.toUpperCase()))throw new Error('사이즈명은 중복 없이 입력하세요.')
    seen.add(name.toUpperCase())
    const result={name}
    for(const [key,min,max]of [['shoulder',20,90],['chestFlat',25,110],['length',30,120],['sleeve',5,65]]){
      const raw=row[key]
      if(key==='sleeve'&&(raw===''||raw==null)){result[key]=null;continue}
      const value=Number(raw)
      if(raw===''||raw==null||!Number.isFinite(value)||value<min||value>max)throw new Error(`${name}: ${key} 실측값(cm)을 확인하세요.`)
      result[key]=value
    }
    return Object.freeze(result)
  })
  if(!normalized.some(row=>row.name===referenceName))throw new Error('3D 비교 기준 사이즈를 선택하세요.')
  return Object.freeze({productKey,rows:Object.freeze(normalized),referenceName,
    source:Object.freeze({type:source.type,url,label:source.type==='sample'?'UI 검증용 샘플 · 판매 상품 실측 아님':'판매처 원문 수동 입력 · 자동 대조 미완료'})})
}

export function selectProductSize(table,name) {
  const row=table.rows.find(row=>row.name===name),reference=table.rows.find(row=>row.name===table.referenceName)
  if(!row||!reference)throw new Error('선택 사이즈가 입력된 표에 없습니다.')
  const delta={shoulder:(row.shoulder-reference.shoulder)/100,chest:(row.chestFlat-reference.chestFlat)/100,
    length:(row.length-reference.length)/100,sleeve:row.sleeve==null||reference.sleeve==null?0:(row.sleeve-reference.sleeve)/100}
  return {table,name,row,reference,delta,sleeveSupported:row.sleeve!=null}
}

export function garmentWeightsForProductSize(size,model,bodyWeights){return size&&model.supportsProductDesign?null:bodyWeights}

export function compareProductSize(size,body) {
  return {shoulderDifferenceCm:body.shoulder_width_cm!==''&&body.shoulder_width_cm!=null&&Number.isFinite(Number(body.shoulder_width_cm))?size.row.shoulder-Number(body.shoulder_width_cm):null,
    chestEaseCm:body.chest_circumference_cm!==''&&body.chest_circumference_cm!=null&&Number.isFinite(Number(body.chest_circumference_cm))?size.row.chestFlat*2-Number(body.chest_circumference_cm):null,
    garmentChestApproxCm:size.row.chestFlat*2,lengthDifferenceCm:size.row.length-size.reference.length}
}

const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)}

// Template-specific local displacement fields. Product/reference deltas are
// independent of user body morph weights. NOT an absolute garment calibration.
export function sizePosition(x,y,z,d,nz=Math.sign(z)) {
  const side=Math.sign(x),ax=Math.abs(x),torso=1-smooth(.16,.23,ax)
  const shoulder=smooth(.075,.175,ax)*Math.max(smooth(1.10,1.28,y),smooth(.20,.26,ax))
  const chest=smooth(.0,.13,ax)*torso*(1-smooth(1.27,1.34,y))
  const hem=(1-smooth(1.00,1.40,y))*(1-smooth(.20,.28,ax))
  const sleeve=smooth(.205,.275,ax)*smooth(1.13,1.23,y)
  // Measured rest-pose shoulder-to-cuff direction is approximately (.65,-.76),
  // not the previous shallow (.85,-.53). Oversize sleeves must droop along
  // that arm direction rather than slide horizontally into the upper arm.
  const armX=.65,armY=Math.sqrt(1-armX*armX)
  const depth=d.chest*.10*smooth(.02,.10,Math.abs(z))*torso*(1-smooth(1.27,1.34,y))
  // Rotate only the distal sleeve about the measured shoulder anchor when
  // oversized; unlike translating it down, this preserves seam-to-cuff length.
  const angle=Math.max(0,d.shoulder)*1.8*sleeve,rx=ax-.182,ry=y-1.371
  const rotateX=rx*(Math.cos(angle)-1)+ry*Math.sin(angle),rotateY=-rx*Math.sin(angle)+ry*(Math.cos(angle)-1)
  // Extending the old tapered hem straight down copied waist depth onto the
  // hips. Continue a modest back drape with length, independently of the body.
  // Hem circumference is not provided by the chart: this remains an estimate.
  const backDrape=Math.min(.07,Math.max(0,d.length)*.5)*(1-smooth(.96,1.15,y))*(1-smooth(.18,.27,ax))*smooth(.01,.05,-z)
  return [x+side*(d.shoulder*.5*shoulder+d.chest*.5*chest+d.sleeve*armX*sleeve+rotateX),
    y-d.length*hem+rotateY-d.sleeve*armY*sleeve,z+Math.sign(z)*depth-backDrape]
}

const calibrationCache=new WeakMap()
const controls=['shoulder','chest','length','sleeve'], measures=['shoulder','chestFlat','length','sleeve']
function solveLinear(matrix,rhs){
  const a=matrix.map((row,i)=>[...row,rhs[i]])
  for(let k=0;k<4;k++){
    let pivot=k;for(let i=k+1;i<4;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i
    if(Math.abs(a[pivot][k])<1e-8)return null
    ;[a[k],a[pivot]]=[a[pivot],a[k]]
    const d=a[k][k];for(let j=k;j<5;j++)a[k][j]/=d
    for(let i=0;i<4;i++)if(i!==k){const f=a[i][k];for(let j=k;j<5;j++)a[i][j]-=f*a[k][j]}
  }
  return a.map(row=>row[4])
}

// Fit the declared geometric proxies, NOT an independently validated garment
// pattern. No body measurements or body morph weights enter this calculation.
export function calibrateProductSize(source,row){
  let cache=calibrationCache.get(source);if(!cache){cache=new Map();calibrationCache.set(source,cache)}
  const key=JSON.stringify(measures.map(name=>row[name]??null));if(cache.has(key))return cache.get(key)
  const p=source.attributes.position,landmarks=tshirtLandmarks(source),baseline=measureTshirt(source,landmarks)
  if(!landmarks.chestRingClosed)return {converged:false,reason:'몸통 측정 링을 확정하지 못했습니다.'}
  const targets=Object.fromEntries(measures.map(name=>[name,name==='sleeve'?(row.sleeve??baseline.sleeve):row[name]]))
  const evaluate=d=>{
    const points=new Map()
    return measureTshirt(source,landmarks,index=>{
      if(!points.has(index))points.set(index,sizePosition(p.getX(index),p.getY(index),p.getZ(index),d,source.attributes.normal.getZ(index)))
      return points.get(index)
    })
  }
  let d={shoulder:0,chest:0,length:0,sleeve:0},measured=evaluate(d),iterations=0
  const norm=m=>Math.max(...measures.map(name=>Math.abs(targets[name]-m[name])))
  const bounds=[[-.08,.20],[-.10,.25],[-.15,.40],[-.10,.25]]
  for(;iterations<20&&norm(measured)>.03;iterations++){
    const columns=controls.map(name=>{const m=evaluate({...d,[name]:d[name]+.001});return measures.map(key=>(m[key]-measured[key])/.001)})
    const matrix=measures.map((_,i)=>columns.map(column=>column[i]))
    const step=solveLinear(matrix,measures.map(name=>targets[name]-measured[name]));if(!step)break
    let accepted=false
    for(const alpha of [1,.5,.25,.125,.0625]){
      const next=Object.fromEntries(controls.map((name,i)=>[name,Math.max(bounds[i][0],Math.min(bounds[i][1],d[name]+step[i]*alpha))]))
      const m=evaluate(next)
      if(norm(m)<norm(measured)){d=next;measured=m;accepted=true;break}
    }
    if(!accepted)break
  }
  const result={converged:norm(measured)<=.05,delta:d,measured,targets,iterations,maxErrorCm:norm(measured),
    method:'기준점/닫힌 몸통 링의 수치 목표 보정 · 판매처 봉제선 대응 미검증'}
  if(!result.converged)result.reason='현재 국소 변형 범위에서 목표 치수에 근접하지 못했습니다. 마지막 성공 형상을 유지합니다.'
  cache.set(key,result);return result
}

export function applyProductSize(geometry,source,size) {
  const calibration=size?calibrateProductSize(source,size.row):null
  if(calibration&&!calibration.converged)return calibration
  const a=geometry.attributes.position,b=source.attributes.position,d=calibration?.delta??{shoulder:0,chest:0,length:0,sleeve:0}
  for(let i=0;i<b.count;i++)a.setXYZ(i,...sizePosition(b.getX(i),b.getY(i),b.getZ(i),d,source.attributes.normal.getZ(i)))
  a.needsUpdate=true
  // Print dimensions stay in the resized rest pose: size changes do not
  // stretch the source aspect ratio; body morphs subsequently carry the ink.
  const print=geometry.attributes.onfitPrintPosition
  if(print){print.array.set(a.array);print.needsUpdate=true}
  if(Object.values(d).every(value=>value===0))geometry.attributes.normal.array.set(source.attributes.normal.array)
  else {
    geometry.computeVertexNormals()
    // Weld shading only across existing UV splits; never merge/reorder vertices.
    const sums=new Map(),keys=[];const normal=geometry.attributes.normal
    for(let i=0;i<b.count;i++){
      const key=[b.getX(i),b.getY(i),b.getZ(i)].map(v=>v.toFixed(6)).join(',');keys.push(key)
      const sum=sums.get(key)??[0,0,0];sum[0]+=normal.getX(i);sum[1]+=normal.getY(i);sum[2]+=normal.getZ(i);sums.set(key,sum)
    }
    for(let i=0;i<b.count;i++){const n=sums.get(keys[i]),length=Math.hypot(...n)||1;normal.setXYZ(i,n[0]/length,n[1]/length,n[2]/length)}
  }
  geometry.attributes.normal.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere()
  return calibration
}
