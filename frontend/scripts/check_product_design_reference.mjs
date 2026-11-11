import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import { cropPixels } from '../src/components/fitting/productDesign.js'
const folder=new URL('../../assets/blender/previews/product_design_v1/',import.meta.url)
const {width,height}=JSON.parse(await readFile(new URL('reference.json',folder),'utf8'))
const data=new Uint8ClampedArray(await readFile(new URL('reference.rgba',folder)))
// Hand-selected QA box for this known user photo, not an automatic detector.
const selection={x:.35,y:.25,w:.31,h:.17}
const crop=cropPixels(data,width,height,selection,{removeBackground:true,background:'#16181D',tolerance:45})
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
function chunk(type,bytes){const tag=Buffer.from(type),n=Buffer.alloc(4),sum=Buffer.alloc(4);n.writeUInt32BE(bytes.length);sum.writeUInt32BE(crc(Buffer.concat([tag,bytes])));return Buffer.concat([n,tag,bytes,sum])}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(crop.width,0);ihdr.writeUInt32BE(crop.height,4);ihdr[8]=8;ihdr[9]=6
const rows=[];for(let y=0;y<crop.height;y++)rows.push(Buffer.from([0]),Buffer.from(crop.data.subarray(y*crop.width*4,(y+1)*crop.width*4)))
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))])
await writeFile(new URL('selected_design_preview.png',folder),png,{flag:'wx'})
const report={selection,width:crop.width,height:crop.height,aspect:crop.aspect,
  opaquePixels:crop.data.filter((v,i)=>i%4===3&&v===255).length,transparentPixels:crop.data.filter((v,i)=>i%4===3&&v===0).length,
  sourceSha256:createHash('sha256').update(await readFile(new URL('../public/textures/nike-shirt-reference.png',import.meta.url))).digest('hex'),
  browserVerified:false,note:'Only hand-picked crop and color-key extraction verified; not a GPU-rendered fitting result.'}
await writeFile(new URL('crop_validation.json',folder),JSON.stringify(report,null,2),{flag:'wx'})
console.log(JSON.stringify(report))
