import { useCallback, useEffect, useState } from 'react'
import PriceTrendChart from '../components/price/PriceTrendChart.jsx'
import Icon from '../components/common/Icon.jsx'
import { getSeasonalFavorites } from '../services/seasonalFavorites.js'
import { getDemoPriceHistory } from '../services/priceHistoryDemo.js'

function formatPrice(value, currencyCode) {
  if (!Number.isFinite(value)) return '가격 정보 없음'
  try {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: currencyCode || 'KRW',
    }).format(value)
  } catch {
    return `${value.toLocaleString('ko-KR')} ${currencyCode || ''}`.trim()
  }
}

function formatDate(value) {
  if (!value) return '확인할 수 없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '확인할 수 없음'
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(date)
}

export default function PriceTimingPage({ session }) {
  const [favorites, setFavorites] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadFavorites = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const loaded = await getSeasonalFavorites()
      setFavorites(loaded)
      setSelectedId((current) => loaded.some((item) => item.id === current) ? current : loaded[0]?.id || '')
    } catch (loadError) {
      setFavorites([])
      setSelectedId('')
      setError(loadError instanceof Error ? loadError.message : '찜한 상품을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFavorites()
  }, [loadFavorites, session?.user?.id])

  const selected = favorites.find((favorite) => favorite.id === selectedId)
  const price = Number.isFinite(selected?.price) && selected.price >= 0 ? selected.price : null
  const currencyCode = selected?.currencyCode || 'KRW'
  const priceHistory = price !== null
    ? [{ price, observedAt: selected.createdAt }]
    : []

  const demoHistory = price === null ? [] : getDemoPriceHistory(price, selected.productUrl || selected.id)
  const demoPrices = demoHistory.map((point) => point.price)

  return <main className="inner-page"><div className="page-hero page-hero-clay"><span className="eyebrow">04 / PRICE MOMENT</span><h1>마음에 든 겨울 코디,<br /><em>가격도 살펴보기.</em></h1><p>찜한 상품을 선택해 저장된 가격과 지난 1년의 가격 흐름 예시를 확인해 보세요.</p><span className="page-hero-mark">↗</span></div>
    <section className="price-dashboard section-wrap">
      <div className="dashboard-heading">
        <div><span className="eyebrow">YOUR PRICE WATCH</span><h2>찜한 상품 가격 리포트</h2><p>상품을 선택하면 저장된 가격을 기준으로 시연용 그래프를 보여드려요. 비로그인 찜 목록은 현재 브라우저에 저장됩니다.</p></div>
        <a href="#/seasonal" className="button button-outline">시즌 코디 둘러보기 <Icon name="ArrowRight" size={15} /></a>
      </div>

      {loading && <p className="price-message" role="status">찜한 상품을 불러오는 중입니다.</p>}
      {!loading && error && <p className="price-message price-message-error" role="alert">{error} <button type="button" onClick={loadFavorites}>다시 시도</button></p>}
      {!loading && !error && favorites.length === 0 && <div className="price-message">
        <p>아직 찜한 상품이 없습니다. 시즌 코디에서 관심 있는 상품을 찜해 보세요.</p>
        <a className="button button-dark" href="#/seasonal">시즌 코디 보러 가기</a>
      </div>}

      {!loading && !error && favorites.length > 0 && <>
        <div className="price-favorite-selector" aria-label="가격을 확인할 찜한 상품">
          {favorites.map((favorite) => (
            <button type="button" className={`price-favorite-option${selectedId === favorite.id ? ' is-selected' : ''}`} key={favorite.id} onClick={() => setSelectedId(favorite.id)} aria-pressed={selectedId === favorite.id}>
              <img src={favorite.imageUrl} alt="" loading="lazy" />
              <span><small>{favorite.season} · {favorite.type}</small><strong>{favorite.title}</strong><em>{formatPrice(favorite.price, favorite.currencyCode)}</em></span>
              {selectedId === favorite.id && <Icon name="Check" size={16} />}
            </button>
          ))}
        </div>

        {selected && <article className="dashboard-card price-history-demo" aria-labelledby="demo-history-title">
          <div className="panel-top">
            <div><span className="eyebrow">ONE YEAR PRICE HISTORY · DEMO</span><h2 id="demo-history-title">{selected.title} · 1년 가격 추이 예시</h2></div>
            <span className="status-pill">시연용 가상 데이터</span>
          </div>
          {price !== null ? <>
            <p>{formatDate(demoHistory[0].observedAt)} ~ {formatDate(demoHistory[demoHistory.length - 1].observedAt)} · 찜할 때 저장된 가격 기준</p>
            <div className="chart-big"><PriceTrendChart history={demoHistory} currencyCode={currencyCode} /></div>
            <div className="price-stats">
              <div><span>기준 가격 (찜한 시점)</span><strong>{formatPrice(price, currencyCode)}</strong></div>
              <div><span>예시 1년 최저가</span><strong>{formatPrice(Math.min(...demoPrices), currencyCode)}</strong></div>
              <div><span>예시 1년 최고가</span><strong>{formatPrice(Math.max(...demoPrices), currencyCode)}</strong></div>
            </div>
            <details className="price-history-details">
              <summary>월별 예시 가격 보기</summary>
              <table><caption>시연용 월별 가격 예시</caption><thead><tr><th scope="col">날짜</th><th scope="col">예시 가격</th></tr></thead>
                <tbody>{demoHistory.map((point) => <tr key={point.observedAt}><td>{formatDate(point.observedAt)}</td><td>{formatPrice(point.price, currencyCode)}</td></tr>)}</tbody>
              </table>
            </details>
          </> : <p role="status">저장된 상품 가격이 없어 시연용 그래프를 표시할 수 없습니다.</p>}
        </article>}

        {selected && <div className="dashboard-grid">
          <article className="dashboard-card trend-panel">
            <div className="panel-top"><div><span className="eyebrow">{selected.vendor || '찜한 상품'} · {selected.season}</span><h3>{selected.title}</h3></div><span className="status-pill">가격 기록 {price === null ? '대기 중' : '확인'}</span></div>
            <div className="price-stats">
              <div><span>찜할 때 표시 가격</span><strong>{price === null ? '가격 정보 없음' : formatPrice(price, currencyCode)}</strong></div>
              <div><span>가격 이력</span><strong>{priceHistory.length}건</strong></div>
              <div><span>마지막 확인</span><strong>{formatDate(selected.createdAt)}</strong></div>
            </div>
            <p className="data-note">표시 가격은 찜한 시점에 제공된 상품 정보입니다. 판매처의 현재 가격이나 과거 가격 이력과 다를 수 있습니다.</p>
          </article>
          <article className="dashboard-card timing-panel">
            <span className="eyebrow">ONFIT INSIGHT</span><div className="insight-icon"><Icon name="Sparkles" size={20} /></div>
            <h3>가격 기록이 쌓이면<br /><em>변화를 알려드릴게요.</em></h3>
            <div className="timing-meter"><span /><span /><span /><span /><span /></div>
            <div className="timing-labels"><span>수집 전</span><span>분석 대기</span></div>
            <p>현재는 찜한 시점의 가격 기록 {priceHistory.length}건만 있어 가격 추이와 구매 적기를 계산할 수 없습니다. 실제 판매처 가격 수집이 연결되면 기록을 바탕으로 분석할 수 있어요.</p>
            {selected.productUrl && <a className="text-link" href={selected.productUrl} target="_blank" rel="noopener noreferrer">상품 페이지에서 현재 가격 확인 <Icon name="ArrowUpRight" size={15} /></a>}
          </article>
        </div>}
      </>}
    </section>
  </main>
}
