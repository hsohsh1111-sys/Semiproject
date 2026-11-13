import test from 'node:test'
import assert from 'node:assert/strict'
import { searchFeatures } from './featureSearch.js'

test('keywords resolve to existing feature pages', () => {
  for (const [query, href] of [['인바디','#/fitting'],['모자','#/fitting'],['이미지','/ai-fashion/'],['찜','#/wardrobe'],['탈퇴','#/mypage'],['최저가','#/compare']]) {
    assert.equal(searchFeatures(query)[0].href, href)
  }
})
test('related results and exact title ranking', () => {
  assert.equal(searchFeatures('가격 비교')[0].href, '#/compare')
  assert.deepEqual(new Set(searchFeatures('가격').map(item=>item.href)),new Set(['#/price','#/compare']))
  assert.ok(searchFeatures('코디').length > 1)
  assert.equal(searchFeatures(' 3D 피팅 ')[0].href, '#/fitting')
})
test('no matches never invent a destination; suggestions are bounded', () => {
  assert.deepEqual(searchFeatures('https://unknown.example'), [])
  assert.deepEqual(searchFeatures('존재하지않는기능'), [])
  assert.ok(searchFeatures('').length <= 6)
})
test('admin feature is suggested only to administrator', () => {
  assert.deepEqual(searchFeatures('관리자'), [])
  assert.equal(searchFeatures('관리자', true)[0].href, '#/admin')
})
