import { API_BASE } from './api.js'

const KEY = 'onfit:auth-session:v1'
function browserStorage() {
  try { return globalThis.sessionStorage } catch { return null }
}

export function clearLoginSession(storage = browserStorage()) {
  try { storage?.removeItem(KEY) } catch { /* Login/logout still works without storage. */ }
}

export function saveLoginSession(session, storage = browserStorage(), now = Date.now()) {
  if (!session) { clearLoginSession(storage); return null }
  if (typeof session.access_token !== 'string' || !session.access_token
      || !Number.isFinite(session.expires_in) || session.expires_in <= 0) {
    throw new Error('로그인 유효 시간을 확인할 수 없습니다.')
  }
  const expires_at = now + session.expires_in * 1000
  // Bearer tokens are accessible to same-origin JS: tab-scoped storage only.
  // Never persist password, user profile, InBody values or refresh tokens here.
  try { storage?.setItem(KEY, JSON.stringify({ access_token: session.access_token, expires_at })) } catch { /* memory-only fallback */ }
  return { ...session, expires_at }
}

export async function restoreLoginSession(fetcher = fetch, storage = browserStorage(), signal, clock = Date.now) {
  const now = clock()
  let saved
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return null
    saved = JSON.parse(raw)
  } catch { clearLoginSession(storage); return null }
  if (typeof saved?.access_token !== 'string' || !saved.access_token
      || !Number.isFinite(saved.expires_at) || saved.expires_at <= now) {
    clearLoginSession(storage)
    return null
  }
  // The server validates signature/account. Local expiry alone is not proof.
  const response = await fetcher(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${saved.access_token}` }, signal,
  })
  if (response.status === 401) { clearLoginSession(storage); return null }
  if (!response.ok) throw new Error('로그인 상태를 확인하지 못했습니다. 다시 시도해 주세요.')
  const user = await response.json()
  if (!Number.isInteger(user?.id) || user.id <= 0) throw new Error('회원 정보를 확인하지 못했습니다.')
  const checkedAt = clock()
  if (saved.expires_at <= checkedAt) { clearLoginSession(storage); return null }
  return { access_token: saved.access_token, token_type: 'bearer', user,
    expires_at: saved.expires_at, expires_in: Math.max(0, (saved.expires_at - checkedAt) / 1000) }
}
