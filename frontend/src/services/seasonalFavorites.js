const STORAGE_KEY = 'onfit_seasonal_favorites'
export const FAVORITES_CHANGE_EVENT = 'onfit-seasonal-favorites-change'

function notifyFavoritesChanged(favorites) {
  window.dispatchEvent(new CustomEvent(FAVORITES_CHANGE_EVENT, { detail: favorites }))
}

function saveFavorites(favorites) {
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

export function getSeasonalFavorites() {
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
  if (migrated) saveFavorites(items)
  return items
}

export function getSeasonalFavoriteId(look, product, type) {
  return `${look.id}:${product.id || product.handle || type}`
}

export function toggleSeasonalFavorite(look, season, type, product) {
  const favorites = getSeasonalFavorites()
  const id = getSeasonalFavoriteId(look, product, type)
  if (favorites.some((favorite) => favorite.id === id)) {
    return saveFavorites(favorites.filter((favorite) => favorite.id !== id))
  }

  return saveFavorites([
    ...favorites,
    {
      id,
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
    },
  ])
}

export function removeSeasonalFavorite(id) {
  const favorites = getSeasonalFavorites()
  return saveFavorites(favorites.filter((favorite) => favorite.id !== id))
}
