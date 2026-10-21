import PriceTrendChart from '../components/price/PriceTrendChart.jsx'
import Icon from '../components/common/Icon.jsx'
import { mockProducts } from '../services/api.js'
export default function PriceTimingPage() {
  return <main className="inner-page"><div className="page-hero page-hero-clay"><span className="eyebrow">04 / PRICE MOMENT</span><h1>마음에 든다면,<br /><em>가격도 살펴보기.</em></h1><p>관심 상품의 가격 흐름을 읽고 조금 더 현명한 타이밍을 찾아요.</p><span className="page-hero-mark">↗</span></div>
    <section className="price-dashboard section-wrap"><div className="dashboard-heading"><div><span className="eyebrow">YOUR PRICE WATCH</span><h2>관심 아이템 가격 리포트</h2><p>가격 데이터가 쌓일수록 인사이트가 정교해집니다.</p></div><a href="#/compare" className="button button-outline">상품 비교하기 <Icon name="ArrowRight" size={15} /></a></div>
      <div className="dashboard-grid"><article className="dashboard-card trend-panel"><div className="panel-top"><div><span className="eyebrow">ONFIT SELECT · BAG</span><h3>Everyday Leather Tote</h3></div><span className="status-pill">가격 흐름</span></div><div className="chart-big"><PriceTrendChart /></div><div className="price-stats"><div><span>현재 최저가</span><strong>₩178,000</strong></div><div><span>10주 평균</span><strong>₩202,300</strong></div><div><span>기간 내 최저</span><strong>₩169,000</strong></div></div><p className="data-note">* 시연용 샘플 값입니다. 실제 가격 이력이 연결되면 최신 데이터로 표시됩니다.</p></article>
      <article className="dashboard-card timing-panel"><span className="eyebrow">ONFIT INSIGHT</span><div className="insight-icon"><Icon name="Sparkles" size={20} /></div><h3>가격 이력을 모아<br /><em>좋은 때를 찾아요.</em></h3><div className="timing-meter"><span /><span /><span /><span /><span /></div><div className="timing-labels"><span>이력 수집 중</span><span>분석 대기</span></div><p>충분한 가격 이력이 쌓이기 전에는 구매 적기를 추천하지 않아요. 상품 데이터가 연결되면 판매처별 가격과 함께 살펴볼게요.</p><a href="#/compare" className="text-link">판매처별 가격 비교 <Icon name="ArrowRight" size={15} /></a></article></div>
      <div className="watched-row"><div><span className="eyebrow">MORE TO WATCH</span><h3>함께 살펴보는 아이템</h3></div>{mockProducts.slice(0, 3).map((product) => <a href="#/compare" className="watched-item" key={product.id}><img src={product.image} alt="" loading="lazy" /><span><small>{product.category}</small><b>{product.name}</b><strong>₩{product.price.toLocaleString('ko-KR')}</strong></span><Icon name="ArrowUpRight" size={16} /></a>)}</div>
    </section>
  </main>
}
