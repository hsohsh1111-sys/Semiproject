import { PRODUCT_TEMPLATES, safeProductUrl } from './productFitting.js'
import { validateSizeTable } from './productSizing.js'

// Exact categories only. Broad TOP/KNIT labels cannot determine a 3D cut.
export function catalogProduct(row, { source = 'unverified' } = {}) {
  const id = typeof row?.id === 'string' || Number.isSafeInteger(row?.id) ? String(row.id).trim() : ''
  const category = typeof row?.category === 'string' && Object.hasOwn(PRODUCT_TEMPLATES, row.category) ? row.category : 'unsupported'
  const product = {
    key: `catalog:${source}:${id}`, productId: id || null,
    name: typeof row?.name === 'string' && row.name.trim() ? row.name.trim() : '상품명 미제공',
    category, categoryLabel: typeof row?.category === 'string' ? row.category : '분류 미제공',
    frontImage: safeProductUrl(row?.front_image, { image: true }) ?? safeProductUrl(row?.image, { image: true }),
    backImage: safeProductUrl(row?.back_image, { image: true }),
    seller: typeof row?.seller_name === 'string' ? row.seller_name : null,
    purchaseUrl: safeProductUrl(row?.product_url), brand: typeof row?.brand === 'string' ? row.brand : null,
    colorHex: /^#[0-9a-f]{6}$/i.test(row?.color_hex ?? '') ? row.color_hex : null,
    sizes: [], sizeChart: null, sizeTable: null,
    dataSource: source === 'mock' ? 'integration_mock' : source === 'sample' ? 'sample' : 'catalog_unverified',
    verification: source === 'mock' ? '연동 테스트 Mock · 실제 판매 상품 아님' : source === 'sample' ? '현재 API 샘플 · 실제 판매 상품 아님' : 'API 수신 · 판매처 원문 대조 미완료',
    imageRights: 'API 응답만으로 이미지 사용 권한이 확인되지 않음',
  }
  const warnings = []
  if (!id || !row?.name?.trim?.()) warnings.push('상품 ID 또는 상품명이 없어 피팅 미지원')
  if (!product.frontImage) warnings.push('사용 가능한 대표/앞면 이미지 없음')
  if (category === 'unsupported') warnings.push('정확한 의류 카테고리 미지원')
  if (row?.size_table) {
    try {
      product.sizeTable = validateSizeTable(product.key, row.size_table.rows, row.size_table.source, row.size_table.referenceName)
      product.sizes = product.sizeTable.rows.map(size => size.name)
    } catch { warnings.push('사이즈표 형식 또는 출처 미확인 · 자동 적용하지 않음') }
  }
  if (!product.sizeTable) warnings.push('구조화된 사이즈표 없음 · 치수 추정하지 않음')
  return { ...product, catalogReady: Boolean(id && row?.name?.trim?.() && product.frontImage && category !== 'unsupported'), warnings }
}

export async function loadCatalog(base, { fetcher = globalThis.fetch, signal, source = 'sample' } = {}) {
  const response = await fetcher(`${base.replace(/\/$/, '')}/products/`, { signal })
  if (!response.ok) throw new Error(`상품 API 오류 (HTTP ${response.status})`)
  const rows = await response.json()
  if (!Array.isArray(rows)) throw new Error('상품 API는 현재 배열 응답만 지원합니다.')
  return rows.map(row => catalogProduct(row, { source }))
}

// Same array/item shape as GET /api/products/; optional fields are proposed,
// not fields claimed to exist in today's endpoint.
export const CATALOG_MOCK = [
  { id: 'integration-top', name: '[Mock] 반팔 연동 검증', category: 'short_sleeve', price: 0, image: '/textures/nike-shirt-reference.png', tag: 'TEST', color_hex: '#16181D' },
  { id: 'integration-bottom', name: '[Mock] 하의 분류 검증', category: 'pants', price: 0, image: '', tag: 'TEST' },
]
