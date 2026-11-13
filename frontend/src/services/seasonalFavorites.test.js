import test from 'node:test'
import assert from 'node:assert/strict'
import { getSeasonalFavorites, removeSeasonalFavorite, toggleSeasonalFavorite } from './seasonalFavorites.js'

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('guest favorites retain their price and save time without a server', async (t) => {
  const originalWindow = globalThis.window
  const originalCustomEvent = globalThis.CustomEvent
  const events = []
  globalThis.CustomEvent = class {
    constructor(type, options) {
      this.type = type
      this.detail = options.detail
    }
  }
  globalThis.window = {
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    dispatchEvent: (event) => events.push(event),
  }
  t.after(() => {
    globalThis.window = originalWindow
    globalThis.CustomEvent = originalCustomEvent
  })

  const look = { id: 'look', title: 'Winter', style: 'classic', age: '20대', gender: '여성' }
  const product = {
    id: 'product', title: 'Coat', vendor: 'Example', imageUrl: 'https://example.com/coat.jpg',
    price: 12345, currencyCode: 'KRW', storefrontUrl: 'https://example.com', handle: 'coat',
  }
  assert.deepEqual(await getSeasonalFavorites(), [])
  const before = Date.now()
  const [favorite] = await toggleSeasonalFavorite(look, '겨울', '아우터', product, false)
  assert.equal(favorite.price, 12345)
  assert.ok(Date.parse(favorite.createdAt) >= before)
  assert.ok(Date.parse(favorite.createdAt) <= Date.now())
  assert.deepEqual(await getSeasonalFavorites(), [favorite])
  assert.equal(events.at(-1).detail[0].id, favorite.id)
  assert.deepEqual(await removeSeasonalFavorite(favorite.id), [])
  assert.deepEqual(await getSeasonalFavorites(), [])
})

test('invalid guest favorites are reported rather than silently discarded', async (t) => {
  const originalWindow = globalThis.window
  globalThis.window = {
    localStorage: { getItem: () => 'invalid json' },
    sessionStorage: createStorage(),
  }
  t.after(() => { globalThis.window = originalWindow })
  await assert.rejects(getSeasonalFavorites(), /찜 목록을 읽을 수 없습니다/)
})

test('signed-in favorites continue to use the server', async (t) => {
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch
  const sessionStorage = createStorage()
  sessionStorage.setItem('onfit:auth-session:v1', JSON.stringify({
    access_token: 'test-token', expires_at: Date.now() + 60000,
  }))
  globalThis.window = { localStorage: createStorage(), sessionStorage }
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/outfits/favorites'))
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    return { ok: true, status: 200, json: async () => [{ id: 'server-favorite' }] }
  }
  t.after(() => {
    globalThis.window = originalWindow
    globalThis.fetch = originalFetch
  })
  assert.deepEqual(await getSeasonalFavorites(), [{ id: 'server-favorite' }])
})
