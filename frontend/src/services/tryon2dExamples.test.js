import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadTryOnExamples } from './tryon2dExamples.js'

test('real local PNG examples become two separate input files, with safe pixel sizes and no generated result',async()=>{
  const inputs=await loadTryOnExamples({fetcher:async url=>{
    const bytes=await readFile(new URL('../../public'+url,import.meta.url))
    assert.equal(bytes.subarray(1,4).toString(),'PNG')
    const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20)
    assert.ok(w>=64&&h>=64&&w*h<=12000000&&Math.max(w,h)<=8192)
    return {ok:true,blob:async()=>new Blob([bytes],{type:'image/png'})}
  }})
  assert.match(inputs.personImage.name,/onfit-example-person/)
  assert.match(inputs.garmentImage.name,/onfit-example-shirt/)
  assert.equal(inputs.result,undefined)
  assert.ok(inputs.personImage.size<8*1024*1024&&inputs.garmentImage.size<8*1024*1024)
})
test('missing files and SPA HTML responses are rejected; aborted loads do not set inputs',async()=>{
  await assert.rejects(loadTryOnExamples({fetcher:async()=>({ok:false})}))
  await assert.rejects(loadTryOnExamples({fetcher:async()=>({ok:true,blob:async()=>new Blob(['html'],{type:'text/html'})})}))
  const controller=new AbortController();controller.abort()
  await assert.rejects(loadTryOnExamples({signal:controller.signal,fetcher:async()=>({ok:true,blob:async()=>new Blob(['png'],{type:'image/png'})})}),{name:'AbortError'})
})
