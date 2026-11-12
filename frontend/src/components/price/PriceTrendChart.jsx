function formatPrice(value, currencyCode = 'KRW') {
  if (!Number.isFinite(value)) return '가격 정보 없음'
  try {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: currencyCode || 'KRW',
    }).format(value)
  } catch {
    return `${value.toLocaleString('ko-KR')} ${currencyCode}`
  }
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', { year: '2-digit', month: 'numeric' }).format(date)
}

export default function PriceTrendChart({ history = [], currencyCode = 'KRW', demo = false }) {
  if (demo) {
    const points = '0,70 42,58 84,62 126,43 168,50 210,31 252,39 294,16 336,26 378,9'
    return <div className="trend-chart" role="img" aria-label="시연용 가격 흐름 예시">
      <div className="chart-grid"><span>₩180,000</span><span>₩150,000</span><span>₩120,000</span><span>₩90,000</span></div>
      <svg viewBox="0 0 378 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#d2ad7d" stopOpacity=".32"/><stop offset="100%" stopColor="#d2ad7d" stopOpacity="0"/></linearGradient></defs><polygon points={`0,100 ${points} 378,100`} fill="url(#chartFill)"/><polyline points={points} fill="none" stroke="#9b7259" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/><circle cx="378" cy="9" r="4" fill="#fff" stroke="#9b7259" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg>
      <div className="chart-labels"><span>1월 1주</span><span>1월 3주</span><span>2월 1주</span><span>2월 3주</span><span>3월 1주</span></div>
    </div>
  }

  const validHistory = history
    .filter((point) => Number.isFinite(point.price) && point.observedAt && !Number.isNaN(new Date(point.observedAt).getTime()))
    .sort((left, right) => new Date(left.observedAt) - new Date(right.observedAt))

  if (validHistory.length < 2) {
    return <div className="trend-chart trend-chart-empty" role="status">
      <span>{validHistory.length === 1 ? formatPrice(validHistory[0].price, currencyCode) : '아직 기록된 가격이 없어요.'}</span>
      <p>{validHistory.length === 1
        ? '가격 기록이 한 건뿐이라 추이를 표시할 수 없습니다.'
        : '선택한 상품의 가격 기록이 쌓이면 이곳에서 추이를 확인할 수 있어요.'}</p>
    </div>
  }

  const prices = validHistory.map((point) => point.price)
  const minimum = Math.min(...prices)
  const maximum = Math.max(...prices)
  const range = maximum - minimum || 1
  const start = new Date(validHistory[0].observedAt).getTime()
  const duration = new Date(validHistory[validHistory.length - 1].observedAt).getTime() - start
  const points = validHistory.map((point, index) => {
    const x = duration ? (new Date(point.observedAt).getTime() - start) * 378 / duration : index * 378 / (validHistory.length - 1)
    const y = 88 - ((point.price - minimum) / range) * 76
    return { x, y, point }
  })
  const line = points.map(({ x, y }) => `${x},${y}`).join(' ')

  return <div className="trend-chart" role="img" aria-label={`${validHistory.length}건의 가격 기록 추이`}>
    <div className="chart-grid">
      <span>{formatPrice(maximum, currencyCode)}</span>
      <span>{formatPrice((maximum + minimum) / 2, currencyCode)}</span>
      <span>{formatPrice(minimum, currencyCode)}</span>
    </div>
    <svg viewBox="0 0 378 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={line} fill="none" stroke="#9b7259" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(({ x, y, point }, index) => <circle key={`${x}-${index}`} cx={x} cy={y} r="3.5" fill="#fff" stroke="#9b7259" strokeWidth="2" vectorEffect="non-scaling-stroke"><title>{formatDate(point.observedAt)} · {formatPrice(point.price, currencyCode)}</title></circle>)}
    </svg>
    <div className="chart-labels">
      {points.filter((_, index) => index === 0 || index === points.length - 1 || index % Math.ceil((points.length - 1) / 6) === 0)
        .map(({ point }, index) => <span key={`${point.observedAt}-${index}`}>{formatDate(point.observedAt)}</span>)}
    </div>
  </div>
}
