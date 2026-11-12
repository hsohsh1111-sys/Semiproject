function hash(value) {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result = Math.imul(result ^ value.charCodeAt(index), 16777619)
  }
  return result >>> 0
}

export function getDemoPriceHistory(price, productKey, today = new Date()) {
  if (!Number.isFinite(price) || price < 0) {
    throw new TypeError('유효한 상품 가격이 필요합니다.')
  }
  if (typeof productKey !== 'string' || !productKey.trim()) {
    throw new TypeError('상품 식별자가 필요합니다.')
  }
  if (!(today instanceof Date) || Number.isNaN(today.getTime())) {
    throw new TypeError('유효한 날짜가 필요합니다.')
  }

  const phase = hash(productKey) % 12
  return Array.from({ length: 13 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - 12 + index, 1, 12)
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    date.setDate(Math.min(today.getDate(), lastDay))
    const seasonal = Math.sin((date.getMonth() + phase) * Math.PI / 6) * 0.07
    const variation = (hash(`${productKey}:${date.getFullYear()}:${date.getMonth()}`) % 1001 / 1000 - 0.5) * 0.12
    const examplePrice = index === 12 ? price : Math.round(price * (1 + seasonal + variation) * 100) / 100
    return { price: examplePrice, observedAt: date.toISOString() }
  })
}
