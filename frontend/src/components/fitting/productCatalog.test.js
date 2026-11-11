import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogProduct, loadCatalog, CATALOG_MOCK } from './productCatalog.js'
import { planProductFitting } from './productFitting.js'
import { selectProductSize } from './productSizing.js'

test('current API array shape preserves IDs and sample provenance without fabricating optional fields',async()=>{
  let url
  const rows=await loadCatalog('http://localhost:8000/api/',{fetcher:async value=>{url=value;return {ok:true,json:async()=>[{id:'p1',name:'sample',category:'TOP · OATMEAL',price:89000,image:'https://example.com/image.jpg',tag:'TEST'}]}}})
  assert.equal(url,'http://localhost:8000/api/products/')
  assert.equal(rows[0].productId,'p1');assert.equal(rows[0].dataSource,'sample')
  assert.equal(rows[0].purchaseUrl,null);assert.equal(rows[0].sizeTable,null)
  assert.equal(planProductFitting(rows[0]).supported,false)
})
test('Mock category changes choose existing independent garment slots; missing images block execution',()=>{
  const top=catalogProduct(CATALOG_MOCK[0],{source:'mock'})
  const bottom=catalogProduct({...CATALOG_MOCK[1],image:CATALOG_MOCK[0].image},{source:'mock'})
  assert.equal(planProductFitting(top).slot,'top');assert.equal(planProductFitting(bottom).slot,'bottom')
  assert.notEqual(planProductFitting(top).model.url,planProductFitting(bottom).model.url)
  assert.equal(top.dataSource,'integration_mock');assert.equal(top.sizeTable,null)
  assert.equal(planProductFitting(catalogProduct(CATALOG_MOCK[1],{source:'mock'})).supported,false)
})
test('malformed/missing identity, unsafe URLs and broad/prototype categories remain unsupported',()=>{
  for(const row of [null,{}, {...CATALOG_MOCK[0],id:''},{...CATALOG_MOCK[0],category:'TOP'}, {...CATALOG_MOCK[0],category:'constructor'},{...CATALOG_MOCK[0],image:'javascript:alert(1)'}])assert.equal(planProductFitting(catalogProduct(row)).supported,false)
  const p=catalogProduct({...CATALOG_MOCK[0],product_url:'https://user:password@example.com/',color_hex:'black'})
  assert.equal(p.purchaseUrl,null);assert.equal(p.colorHex,null)
})
test('optional proposed chart reuses cm validation and product identity; invalid chart does not crash',()=>{
  const row={...CATALOG_MOCK[0],size_table:{rows:[{name:'M',shoulder:44,chestFlat:52,length:68,sleeve:21}],source:{type:'sample'},referenceName:'M'}}
  const p=catalogProduct(row,{source:'mock'}),size=selectProductSize(p.sizeTable,'M')
  assert.equal(size.table.productKey,p.key);assert.equal(size.row.chestFlat,52)
  assert.equal(catalogProduct({...row,size_table:{rows:[]}}).sizeTable,null)
})
test('HTTP and response shape errors surface without silently replacing them with Mock',async()=>{
  await assert.rejects(loadCatalog('/api',{fetcher:async()=>({ok:false,status:503})}),/503/)
  await assert.rejects(loadCatalog('/api',{fetcher:async()=>({ok:true,json:async()=>({items:[]})})}),/배열/)
})
