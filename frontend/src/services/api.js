const API_BASE = import.meta.env?.VITE_API_BASE_URL || '/api'

export const mockProducts = [
  { id: 'p1', name: 'Sculpted Knit Top', category: 'TOP · OATMEAL', price: 89000, image: 'https://images.unsplash.com/photo-1551163943-3f6a855d1153?auto=format&fit=crop&w=900&q=85', tag: 'YOUR COLOR', tone: 'warm' },
  { id: 'p2', name: 'Everyday Leather Tote', category: 'BAG · ESPRESSO', price: 178000, image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85', tag: 'BEST MATCH', tone: 'sand' },
  { id: 'p3', name: 'Soft Form Sneakers', category: 'SHOES · CLOUD', price: 129000, image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85', tag: 'TRENDING', tone: 'coral' },
  { id: 'p4', name: 'Luna Gold Earrings', category: 'JEWELRY · 14K GOLD', price: 64000, image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=900&q=85', tag: 'JUST FOR YOU', tone: 'lilac' },
]

export async function getRecommendations(profile = {}) {
  try {
    const response = await fetch(`${API_BASE}/outfits/recommendations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile),
    })
    if (!response.ok) throw new Error('API unavailable')
    return await response.json()
  } catch {
    return mockProducts
  }
}

const mockShopCatalogs = {
  apparel: 'https://apparel-large-catalog.mock.shop/api',
  intl: 'https://apparel-intl.mock.shop/api',
  menswear: 'https://apparel-menswear.mock.shop/api',
  highticket: 'https://apparel-highticket.mock.shop/api',
  accessories: 'https://apparel-accessories.mock.shop/api',
  snowwear: 'https://apparel-snowwear.mock.shop/api',
  vesna: 'https://vesna.mock.shop/api',
  apparelCore: 'https://apparel.mock.shop/api',
  boutique: 'https://apparel-boutique.mock.shop/api',
  streetwear: 'https://streetwear-dropship.mock.shop/api',
  retail: 'https://apparel-retail.mock.shop/api',
  streetwearPod: 'https://streetwear-pod.mock.shop/api',
  apparelStreetwear: 'https://apparel-streetwear.mock.shop/api',
  outdoor: 'https://apparel-outdoor.mock.shop/api',
  autoaccessories: 'https://autoaccessories.mock.shop/api',
}

const mockShopProductQuery = `
  query SeasonalProducts {
    products(first: 250) {
      nodes {
        id
        title
        handle
        vendor
        productType
        featuredImage {
          url
          altText
        }
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
`

export async function getMockProducts(catalog) {
  const endpoint = mockShopCatalogs[catalog]
  if (!endpoint) {
    throw new Error(`알 수 없는 Mock.shop 카탈로그입니다: ${catalog}`)
  }

  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: mockShopProductQuery }),
    })
  } catch {
    throw new Error('Mock.shop 카탈로그에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.')
  }
  if (!response.ok) {
    throw new Error('Mock.shop 샘플 상품을 불러오지 못했습니다.')
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error('Mock.shop에서 올바르지 않은 응답을 받았습니다.')
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error(`Mock.shop 상품 조회 오류: ${payload.errors.map((error) => error.message).join('; ')}`)
  }
  const products = payload.data?.products?.nodes
  if (!Array.isArray(products)) {
    throw new Error('Mock.shop에서 올바른 상품 응답을 받지 못했습니다.')
  }
  const uniqueProducts = new Map()
  for (const product of products) {
    const imageUrl = product.featuredImage?.url
    const price = Number(product.priceRange?.minVariantPrice?.amount)
    if (product.id && product.handle && imageUrl && Number.isFinite(price)) {
      uniqueProducts.set(product.id, {
        ...product,
        imageUrl,
        price,
        currencyCode: product.priceRange.minVariantPrice.currencyCode,
        storefrontUrl: endpoint.replace('.mock.shop/api', '.hydrogen.mock.shop'),
      })
    }
  }
  return [...uniqueProducts.values()]
}

export { API_BASE }
