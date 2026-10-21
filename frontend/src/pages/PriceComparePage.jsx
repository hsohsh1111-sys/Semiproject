import Icon from '../components/common/Icon.jsx'
import { mockProducts } from '../services/api.js'
const offers = [{ shop: 'MUSE STORE', price: 178000, shipping: '무료배송', badge: '최저가' }, { shop: 'THE OBJECT', price: 189000, shipping: '무료배송', badge: '' }, { shop: 'DAILY ARCHIVE', price: 205000, shipping: '₩3,000', badge: '' }]
export default function PriceComparePage() {
  const product = mockProducts[1]
  return <main className="inner-page"><div className="page-hero page-hero-clay compare-hero"><span className="eyebrow">05 / SAME ITEM, SMARTER CHOICE</span><h1>어디서 사면 좋을까?<br /><em>한눈에 비교해요.</em></h1></div>
    <section className="compare-content section-wrap"><div className="compare-product"><img src={product.image} alt={product.name} /><div><span className="eyebrow">ONFIT SELECT · BAG</span><h2>{product.name}</h2><p>부드러운 실루엣과 매일 들어도 좋은 넉넉한 수납력.</p><span className="compare-status"><i /> 판매처 3곳 비교 중</span></div></div>
      <div className="offer-list"><div className="offer-header"><span>판매처</span><span>배송</span><span>판매가</span><span /></div>{offers.map((offer) => <div className="offer-row" key={offer.shop}><div className="offer-shop">{offer.badge && <span>{offer.badge}</span>}<strong>{offer.shop}</strong></div><span>{offer.shipping}</span><strong>₩{offer.price.toLocaleString('ko-KR')}</strong><a href="#/price" className="offer-link" aria-label={`${offer.shop} 가격 인사이트`}><Icon name="ArrowUpRight" size={17} /></a></div>)}</div>
      <p className="data-note">판매처와 가격은 서비스 시연을 위한 예시입니다. 실제 구매 전 판매 페이지에서 최신 정보와 상품 옵션을 확인해 주세요.</p><a className="text-link" href="#/price"><Icon name="ArrowLeft" size={15} /> 가격 인사이트로 돌아가기</a>
    </section>
  </main>
}
