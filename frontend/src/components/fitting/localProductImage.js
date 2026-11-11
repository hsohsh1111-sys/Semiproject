// Blob URLs are created locally; never accept pasted text as a URL or HTML.
export function clipboardImage(data) {
  for (const item of Array.from(data?.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return Array.from(data?.files ?? []).find(file => file.type.startsWith('image/')) ?? null
}

export function validateLocalImage(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('PNG·JPG·WEBP 이미지를 붙여넣거나 선택하세요.')
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('이미지는 10MiB 이하만 사용할 수 있습니다.')
}

export function localImageProduct(key, url, name) {
  return { key, productId: null, name: name || '붙여넣은 의류 사진', seller: null,
    frontImage: url, backImage: null, purchaseUrl: null, category: 'short_sleeve',
    colorHex: null, sizes: [], sizeChart: null, dataSource: 'local_image',
    verification: '직접 넣은 사진 · 판매 상품 정보 미확인',
    imageRights: '사용자가 제공한 이미지 · 디자인 적용 시 사용 권한 확인 필요' }
}
