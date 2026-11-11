import test from 'node:test'
import assert from 'node:assert/strict'
import { saveLoginSession, restoreLoginSession, clearLoginSession } from './authSession.js'

function storage() {
  const values = new Map()
  return { values, getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}
const session = { access_token: 'synthetic-token', expires_in: 1800,
  user: { id: 7, name: 'Test' }, password: 'must-not-store' }

test('refresh restores a verified user without persisting password or user details', async () => {
  const store = storage()
  saveLoginSession(session, store, 1000)
  assert.deepEqual(JSON.parse([...store.values.values()][0]), { access_token: 'synthetic-token', expires_at: 1801000 })
  const restored = await restoreLoginSession(async (url, options) => {
    assert.ok(url.endsWith('/auth/me'))
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token')
    return { ok: true, json: async () => ({ id: 7, name: 'Verified' }) }
  }, store, undefined, () => 2000)
  assert.equal(restored.user.name, 'Verified')
  assert.equal(restored.expires_at, 1801000) // reloading never extends expiry
})

test('expired token is cleared before contacting the server', async () => {
  const store = storage()
  saveLoginSession(session, store, 0)
  assert.equal(await restoreLoginSession(() => { throw Error('must not fetch') }, store, undefined, () => 1800000), null)
  assert.equal(store.values.size, 0)
})

test('server rejection clears stored token', async () => {
  const store = storage(); saveLoginSession(session, store, 1000)
  assert.equal(await restoreLoginSession(async () => ({ ok: false, status: 401 }), store, undefined, () => 2000), null)
  assert.equal(store.values.size, 0)
})

test('temporary server failure keeps the token for explicit retry', async () => {
  const store = storage(); saveLoginSession(session, store, 1000)
  await assert.rejects(restoreLoginSession(async () => ({ ok: false, status: 503 }), store, undefined, () => 2000))
  assert.equal(store.values.size, 1)
})

test('logout clears only the login key', () => {
  const store = storage(); store.setItem('unrelated', 'keep')
  saveLoginSession(session, store, 1000); clearLoginSession(store)
  assert.deepEqual([...store.values.entries()], [['unrelated', 'keep']])
})

test('malformed storage and blocked storage do not crash the page', async () => {
  const store = storage(); saveLoginSession(session, store, 1000)
  store.setItem([...store.values.keys()][0], 'bad-json')
  assert.equal(await restoreLoginSession(undefined, store), null)
  const blocked = { getItem() { throw Error('blocked') }, setItem() { throw Error('blocked') }, removeItem() { throw Error('blocked') } }
  assert.equal(saveLoginSession(session, blocked, 1000).user.id, 7)
  assert.equal(await restoreLoginSession(undefined, blocked), null)
})

test('expiration while waiting for the server cannot restore an expired session', async () => {
  const store = storage(); saveLoginSession(session, store, 1000)
  let calls = 0
  const result = await restoreLoginSession(async () => ({ok: true, json: async () => ({id: 7})}), store,
    undefined, () => calls++ === 0 ? 2000 : 1801000)
  assert.equal(result, null)
  assert.equal(store.values.size, 0)
})
