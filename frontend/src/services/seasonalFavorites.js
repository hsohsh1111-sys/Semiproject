import { API_BASE } from './api.js'
import { getAccessToken } from './auth.js'

const STORAGE_KEY = 'onfit_seasonal_favorites'
export const FAVORITES_CHANGE_EVENT = 'onfit-seasonal-favorites-change'

function notifyFavoritesChanged(favorites) {
  window.dispatchEvent(new CustomEvent(FAVORITES_CHANGE_EVENT, { detail: favorites }))
}

function saveLocalFavorites(favorites) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites))
  notifyFavoritesChanged(favorites)
  return favorites
}

function migrateLegacyFavorites(favorites) {
  let migrated = false
  const items = favorites.flatMap((favorite) => {
    if (!Array.isArray(favorite.products)) return [favorite]

    migrated = true
    return favorite.products
      .filter((product) => product?.title && product.imageUrl)
      .map((product) => ({
        id: `${favorite.id}:${product.type}`,
        title: product.title,
        vendor: product.vendor,
        imageUrl: product.imageUrl,
        price: product.price,
        currencyCode: product.currencyCode,
        type: product.type,
        lookTitle: favorite.title,
        season: favorite.season,
        style: favorite.style,
        age: favorite.age,
        gender: favorite.gender,
      }))
  })

  return { items, migrated }
}

function getLocalFavorites() {
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (!saved) return []

  let parsed
  try {
    parsed = JSON.parse(saved)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('저장된 시즌 코디 찜 목록을 읽을 수 없습니다.')
    }
    throw error
  }

  if (!Array.isArray(parsed)) {
    throw new Error('저장된 시즌 코디 찜 목록 형식이 올바르지 않습니다.')
  }

  const { items, migrated } = migrateLegacyFavorites(parsed)
  if (migrated) saveLocalFavorites(items)
  return items
}

async function favoriteRequest(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('찜한 상품을 저장하려면 서버 연결을 확인해 주세요.')
    }
    throw error
  }

  if (!response.ok) {
    let detail = ''
    try {
      detail = (await response.json()).detail || ''
    } catch {
      // Use a status-based message when the server does not return JSON.
    }
    if (response.status === 401) throw new Error('로그인 상태를 확인해 주세요.')
    throw new Error(detail || '찜한 상품을 처리하지 못했습니다.')
  }
  if (response.status === 204) return null

  try {
    return await response.json()
  } catch {
    throw new Error('서버에서 올바르지 않은 찜 목록 응답을 받았습니다.')
  }
}

export async function getSeasonalFavorites() {
  if (!getAccessToken()) return getLocalFavorites()
  const favorites = await favoriteRequest('/outfits/favorites')
  if (!Array.isArray(favorites)) {
    throw new Error('서버에서 올바르지 않은 찜 목록 응답을 받았습니다.')
  }
  return favorites
}

export function getSeasonalFavoriteId(look, product, type) {
  return `${look.id}:${product.id || product.handle || type}`
}

function createFavorite(look, season, type, product) {
  return {
    id: getSeasonalFavoriteId(look, product, type),
    title: product.title,
    vendor: product.vendor,
    imageUrl: product.imageUrl,
    price: product.price,
    currencyCode: product.currencyCode,
    productUrl: `${product.storefrontUrl}/products/${encodeURIComponent(product.handle)}`,
    type,
    lookTitle: look.title,
    season,
    style: look.style,
    age: look.age,
    gender: look.gender,
  }
}

export async function toggleSeasonalFavorite(look, season, type, product, isSaved) {
  const favorite = createFavorite(look, season, type, product)
  if (getAccessToken()) {
    if (isSaved) {
      await favoriteRequest(`/outfits/favorites?favorite_key=${encodeURIComponent(favorite.id)}`, {
        method: 'DELETE',
      })
    } else {
      await favoriteRequest('/outfits/favorites', {
        method: 'POST',
        body: JSON.stringify(favorite),
      })
    }
    const favorites = await getSeasonalFavorites()
    notifyFavoritesChanged(favorites)
    return favorites
  }

  const favorites = getLocalFavorites()
  return saveLocalFavorites(
    isSaved
      ? favorites.filter((item) => item.id !== favorite.id)
      : [...favorites, { ...favorite, createdAt: new Date().toISOString() }],
  )
}

export async function removeSeasonalFavorite(id) {
  if (getAccessToken()) {
    await favoriteRequest(`/outfits/favorites?favorite_key=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    const favorites = await getSeasonalFavorites()
    notifyFavoritesChanged(favorites)
    return favorites
  }

  const favorites = getLocalFavorites()
  return saveLocalFavorites(favorites.filter((favorite) => favorite.id !== id))
}
