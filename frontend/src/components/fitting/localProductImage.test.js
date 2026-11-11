import test from 'node:test'
import assert from 'node:assert/strict'
import { clipboardImage, validateLocalImage, localImageProduct } from './localProductImage.js'
import { planProductFitting } from './productFitting.js'

test('clipboard screenshot files are used; pasted text and HTML are not interpreted as images',()=>{
  const file=new File(['png'],'capture.png',{type:'image/png'})
  const data={items:[{kind:'string',type:'text/html'},{kind:'file',type:'image/png',getAsFile:()=>file}]}
  assert.equal(clipboardImage(data),file)
  assert.equal(clipboardImage({files:[file]}),file)
  assert.equal(clipboardImage({items:[{kind:'string',type:'text/html'}]}),null)
  assert.equal(clipboardImage({items:[{kind:'file',type:'image/png',getAsFile:()=>null}]}),null)
})
test('supported formats, nonempty images and 10MiB limit are enforced before creating URLs',()=>{
  for(const type of ['image/png','image/jpeg','image/webp'])assert.doesNotThrow(()=>validateLocalImage({type,size:100}))
  for(const file of [null,{type:'image/svg+xml',size:100},{type:'image/png',size:0},{type:'image/png',size:10*1024*1024+1}])assert.throws(()=>validateLocalImage(file))
})
test('local screenshot selects the existing shirt template without inventing product identity or sizes',()=>{
  const file=new File(['png'],'capture.png',{type:'image/png'}),url=URL.createObjectURL(file)
  try {
    const product=localImageProduct('local-image:1',url,file.name),plan=planProductFitting(product)
    assert.equal(plan.supported,true);assert.equal(plan.category,'short_sleeve')
    assert.equal(product.frontImage,url);assert.equal(product.productId,null);assert.equal(product.purchaseUrl,null)
    assert.equal(product.colorHex,null);assert.equal(product.sizeChart,null)
    assert.equal(product.dataSource,'local_image')
    assert.equal(plan.logoApplied,false,'A pasted photo must not claim a print is applied until the user crops and applies it')
  } finally {URL.revokeObjectURL(url)}
})
