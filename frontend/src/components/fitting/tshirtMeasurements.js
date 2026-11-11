// Proxy garment landmarks for the existing v5 asset. Distances are exact for
// these points, but correspondence with a vendor's tape-measure method is NOT
// verified. Never use whole-body/garment bounding box as a shop size measure.
function nearest(geometry,target){const p=geometry.attributes.position;let best=Infinity,index=0;for(let i=0;i<p.count;i++){const d=Math.hypot(p.getX(i)-target[0],p.getY(i)-target[1],p.getZ(i)-target[2]);if(d<best){best=d;index=i}}return index}
const point=(geometry,index)=>{const p=geometry.attributes.position;return[p.getX(index),p.getY(index),p.getZ(index)]}
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t)
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]))
const cache=new WeakMap()

export function tshirtLandmarks(geometry){
  if(cache.has(geometry))return cache.get(geometry)
  const p=geometry.attributes.position,index=geometry.index.array,segments=[]
  const height=1.17 // Below this template's armpit/cuff, not a universal chest line.
  for(let i=0;i<index.length;i+=3){
    const ids=Array.from(index.slice(i,i+3)),hits=[]
    for(let j=0;j<3;j++){
      const a=ids[j],b=ids[(j+1)%3],ya=p.getY(a),yb=p.getY(b)
      if((ya<height&&yb>=height)||(yb<height&&ya>=height))hits.push({a,b,t:(height-ya)/(yb-ya)})
    }
    if(hits.length===2){
      const coords=hits.map(h=>mix(point(geometry,h.a),point(geometry,h.b),h.t))
      if(coords.every(v=>Math.abs(v[0])<.20))segments.push(hits)
    }
  }
  const degrees=new Map(),adjacency=new Map()
  for(const segment of segments){
    const keys=segment.map(h=>{const v=mix(point(geometry,h.a),point(geometry,h.b),h.t);return[v[0],v[2]].map(n=>n.toFixed(5)).join(',')})
    for(let i=0;i<2;i++){const key=keys[i];degrees.set(key,(degrees.get(key)??0)+1);const neighbors=adjacency.get(key)??new Set();neighbors.add(keys[1-i]);adjacency.set(key,neighbors)}
  }
  const visited=new Set();let components=0
  for(const key of degrees.keys())if(!visited.has(key)){components++;const stack=[key];while(stack.length){const next=stack.pop();if(visited.has(next))continue;visited.add(next);stack.push(...adjacency.get(next))}}
  const chestRingClosed=segments.length>10&&components===1&&Array.from(degrees.values()).every(n=>n===2)
  const result={leftShoulder:nearest(geometry,[-.19,1.39,.015]),rightShoulder:nearest(geometry,[.19,1.39,.015]),
    highShoulder:nearest(geometry,[.06,1.455,.01]),frontHem:nearest(geometry,[.04,.85,.13]),
    rightCuff:nearest(geometry,[.345,1.27,.02]),segments,sectionHeight:height,chestRingClosed}
  cache.set(geometry,result);return result
}

export function measureTshirt(geometry,landmarks,getPoint=index=>point(geometry,index)){
  let circumference=0
  for(const segment of landmarks.segments){const [a,b]=segment.map(h=>mix(getPoint(h.a),getPoint(h.b),h.t));circumference+=distance(a,b)}
  return {shoulder:distance(getPoint(landmarks.leftShoulder),getPoint(landmarks.rightShoulder))*100,
    chestFlat:landmarks.chestRingClosed?circumference*50:null,length:(getPoint(landmarks.highShoulder)[1]-getPoint(landmarks.frontHem)[1])*100,
    sleeve:distance(getPoint(landmarks.rightShoulder),getPoint(landmarks.rightCuff))*100}
}

export function measurementComparison(size,geometry,source,getPoint){
  const landmarks=tshirtLandmarks(source),measured=measureTshirt(geometry,landmarks,getPoint)
  return {measured,errors:Object.fromEntries(['shoulder','chestFlat','length','sleeve'].map(key=>[key,size.row[key]==null||measured[key]==null?null:measured[key]-size.row[key]])),chestRingClosed:landmarks.chestRingClosed,
    method:'어깨 기준점 3D 직선 / y=1.17m 몸통 단면 둘레÷2 / 목옆→앞밑단 수직 투영 / 어깨→소매끝 3D 직선. 모두 판매처 실측과의 대응 미검증 추정치.'}
}
