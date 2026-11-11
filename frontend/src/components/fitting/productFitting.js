import { TSHIRT_MORPH_GLB, LONG_SLEEVE_MORPH_GLB, PANTS_GLB, OUTER_GLB, HOODED_JACKET_MORPH_GLB, NEUTRAL_CAP_GLB } from './garmentGlb.js'

export const PRODUCT_TEMPLATES = Object.freeze(Object.fromEntries([
  ['short_sleeve', '반팔 티셔츠', TSHIRT_MORPH_GLB], ['long_sleeve', '긴팔 티셔츠', LONG_SLEEVE_MORPH_GLB],
  ['pants', '바지', PANTS_GLB], ['outer', '아우터', OUTER_GLB],
  ['hooded_jacket', '후드 집업', HOODED_JACKET_MORPH_GLB], ['cap', '모자', NEUTRAL_CAP_GLB],
].map(([category, label, model]) => [category, { category, label, slot: model.slot,
  model: Object.freeze({ ...model, colorProfile: 'product', tintable: true, defaultColor: '#808080', supportsProductDesign: category === 'short_sleeve' }) }])) )

export function safeProductUrl(value, { image = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) return null
  const text = value.trim()
  if (image && /^\/(?!\/)/.test(text) && !text.includes('\\')) return text
  try {
    const url = new URL(text)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export function validateShopProduct(input) {
  const productId = String(input.productId ?? '').trim(), name = String(input.name ?? '').trim(), seller = String(input.seller ?? '').trim()
  if (!productId || !name || !seller) throw new Error('상품 ID·상품명·판매처를 입력하세요.')
  const purchaseUrl = safeProductUrl(input.purchaseUrl), frontImage = safeProductUrl(input.frontImage, { image: true })
  const backImage = input.backImage?.trim() ? safeProductUrl(input.backImage, { image: true }) : null
  if (!purchaseUrl || !frontImage || (input.backImage?.trim() && !backImage)) throw new Error('구매 링크와 이미지 주소를 확인하세요. 외부 주소는 HTTPS만 지원합니다.')
  if (!Object.hasOwn(PRODUCT_TEMPLATES, input.category)) throw new Error('이 상품 종류는 3D 템플릿을 지원하지 않습니다.')
  if (!input.imageUseConfirmed) throw new Error('이미지 사용 조건을 확인한 뒤 체크해 주세요.')
  const colorHex = input.colorHex?.trim() || null
  if (colorHex && !/^#[0-9a-f]{6}$/i.test(colorHex)) throw new Error('색상은 #RRGGBB 형식으로 입력하세요.')
  return Object.freeze({ key: `shop:${new URL(purchaseUrl).origin}:${productId}`, productId, name, seller,
    frontImage, backImage, purchaseUrl, category: input.category, colorHex,
    sizes: String(input.sizes ?? '').split(',').map(s => s.trim()).filter(Boolean),
    sizeChart: String(input.sizeChart ?? '').trim() || null,
    dataSource: 'user_entered', verification: '판매처 원문 대조 미완료', imageRights: '사용자가 사용 조건 확인',
  })
}

export function sampleProductReference(product) {
  return { key: `sample:${product.id}`, productId: product.id, name: product.name, seller: null,
    frontImage: product.image, backImage: null, purchaseUrl: null, category: 'unsupported',
    categoryLabel: product.category, colorHex: null, sizes: [], sizeChart: null,
    dataSource: 'sample', verification: '기존 목록 샘플 · 실제 판매 상품 아님', imageRights: '기존 샘플 이미지 · 상품 매핑 미지원' }
}

export const USER_PHOTO_REFERENCE = Object.freeze({
  key: 'reference:user-nike-photo', productId: null, name: '사용자 제공 나이키 반팔 사진', seller: null,
  frontImage: '/textures/nike-shirt-reference.png', backImage: null, purchaseUrl: null,
  category: 'short_sleeve', colorHex: '#16181D', sizes: [], sizeChart: null,
  dataSource: 'reference', verification: '상품 ID·판매처·구매 링크 미확인 · 로컬 비교용',
  imageRights: '사용자 제공 이미지 · 재배포 권리 미확인',
})

export function planProductFitting(product) {
  if (product?.catalogReady === false) return { supported: false, reason: '필수 상품 정보·이미지 또는 정확한 카테고리가 없어 피팅을 실행할 수 없습니다.' }
  const template = Object.hasOwn(PRODUCT_TEMPLATES, product?.category) ? PRODUCT_TEMPLATES[product.category] : null
  if (!template || product?.dataSource === 'sample') return { supported: false, reason: '상품 종류를 확정할 수 없거나 템플릿 미지원입니다. 샘플을 실제 상품으로 매핑하지 않습니다.' }
  const color = /^#[0-9a-f]{6}$/i.test(product.colorHex ?? '') ? product.colorHex : '#808080'
  return { supported: true, ...template, color,
    colorApplied: Boolean(product.colorHex), logoApplied: false, patternApplied: false,
    note: `${product.colorHex ? '제공된 색상값만 단색 근사 적용' : '색상 미확인: 중립 회색 템플릿'} · 로고·패턴·상품 실측에 따른 사이즈 변형 미지원`,
  }
}
