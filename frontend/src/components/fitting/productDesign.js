import { BufferAttribute, Vector4 } from 'three'

export const PRINT_AREA = Object.freeze({ left: -.15, right: .15, bottom: 1.03, top: 1.37 })
export function printPlacement(input, aspect) {
  if (!Number.isFinite(aspect) || aspect < .25 || aspect > 12) throw new Error('디자인 가로·세로 비율을 확인하세요 (0.25~12).')
  const width = Math.min(.26, .28 * aspect, Math.max(.04, Number(input.width) || .18))
  const height = width / aspect
  return { width, height,
    x: Math.max(PRINT_AREA.left + width / 2, Math.min(PRINT_AREA.right - width / 2, Number(input.x) || 0)),
    y: Math.max(PRINT_AREA.bottom + height / 2, Math.min(PRINT_AREA.top - height / 2, Number(input.y) || 1.22)) }
}

export function cropPixels(pixels, width, height, selection, { removeBackground = false, background = '#16181D', tolerance = 45 } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width * height > 12000000 || pixels.length !== width * height * 4) throw new Error('이미지 픽셀 크기를 확인하세요.')
  const { x, y, w, h } = selection
  if (![x,y,w,h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1.00001 || y + h > 1.00001) throw new Error('디자인 선택 영역을 확인하세요.')
  const left = Math.floor(x * width), top = Math.floor(y * height), cw = Math.min(width-left,Math.round(w*width)), ch = Math.min(height-top,Math.round(h*height))
  if (cw < 8 || ch < 8) throw new Error('디자인 영역은 최소 8×8픽셀이어야 합니다.')
  if (!/^#[0-9a-f]{6}$/i.test(background) || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 180) throw new Error('배경색·제거 강도를 확인하세요.')
  const bg = [1,3,5].map(i=>parseInt(background.slice(i,i+2),16)), data = new Uint8ClampedArray(cw*ch*4)
  for(let row=0;row<ch;row++)for(let col=0;col<cw;col++){
    const source=((row+top)*width+col+left)*4, target=(row*cw+col)*4
    data.set(pixels.subarray(source,source+4),target)
    if(removeBackground){
      const distance=Math.hypot(...bg.map((v,i)=>pixels[source+i]-v))
      data[target+3]=Math.round(pixels[source+3]*Math.max(0,Math.min(1,(distance-tolerance)/20)))
    }
  }
  if(!data.some((v,i)=>i%4===3&&v>0))throw new Error('배경 제거 후 디자인이 남지 않았습니다. 선택 영역이나 제거 강도를 조절하세요.')
  return { data, width:cw, height:ch, aspect:cw/ch }
}

// Preserve original UVs and morph arrays. An owned geometry clone gets a
// front-only auxiliary coordinate field in the template's REST pose, so ink
// stays attached to the actual morphing triangles rather than a floating plane.
export function printGeometry(source) {
  const geometry=source.clone(),p=source.attributes.position,n=source.attributes.normal
  const front=new Float32Array(p.count)
  for(let i=0;i<p.count;i++)front[i]=p.getZ(i)>.035&&n.getZ(i)>.35?Math.min(1,(n.getZ(i)-.35)/.3):0
  geometry.setAttribute('onfitPrintPosition',new BufferAttribute(p.array.slice(),3))
  geometry.setAttribute('onfitPrintFront',new BufferAttribute(front,1))
  return geometry
}

export function createPrintUniforms() {
  return { onfitDesign:{value:null},onfitDesignEnabled:{value:0},onfitPrintRect:{value:new Vector4(0,1.22,.18,.09)},
    onfitPrintArea:{value:new Vector4(PRINT_AREA.left,PRINT_AREA.right,PRINT_AREA.bottom,PRINT_AREA.top)} }
}

export function attachPrintShader(material,uniforms) {
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms)
    shader.vertexShader='attribute vec3 onfitPrintPosition;\nattribute float onfitPrintFront;\nvarying vec3 onfitRestPrint;\nvarying float onfitFrontMask;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nonfitRestPrint=onfitPrintPosition; onfitFrontMask=onfitPrintFront;')
    shader.fragmentShader='uniform sampler2D onfitDesign;\nuniform float onfitDesignEnabled;\nuniform vec4 onfitPrintRect;\nuniform vec4 onfitPrintArea;\nvarying vec3 onfitRestPrint;\nvarying float onfitFrontMask;\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      if(onfitDesignEnabled>0.5 && onfitFrontMask>0.01 && gl_FrontFacing) {
        vec2 designUv=(onfitRestPrint.xy-onfitPrintRect.xy)/onfitPrintRect.zw+0.5;
        bool inside=all(greaterThanEqual(designUv,vec2(0.0)))&&all(lessThanEqual(designUv,vec2(1.0)))
          &&onfitRestPrint.x>=onfitPrintArea.x&&onfitRestPrint.x<=onfitPrintArea.y
          &&onfitRestPrint.y>=onfitPrintArea.z&&onfitRestPrint.y<=onfitPrintArea.w;
        if(inside){ vec4 ink=texture2D(onfitDesign,designUv); diffuseColor.rgb=mix(diffuseColor.rgb,ink.rgb,ink.a*onfitFrontMask); }
      }`)
  }
  material.customProgramCacheKey=()=> 'onfit-product-front-print-v1'
  material.needsUpdate=true
}

export function updatePrintUniforms(uniforms,design) {
  uniforms.onfitDesignEnabled.value=design?.texture?1:0
  uniforms.onfitDesign.value=design?.texture??null
  if(design){const p=printPlacement(design.placement,design.aspect);uniforms.onfitPrintRect.value.set(p.x,p.y,p.width,p.height)}
}
