import { useState } from 'react'
import BrandMark from '../components/common/BrandMark.jsx'
import Icon from '../components/common/Icon.jsx'
import ProductCard from '../components/common/ProductCard.jsx'
import PriceTrendChart from '../components/price/PriceTrendChart.jsx'
import { mockProducts } from '../services/api.js'

const projects = [
  { number: '01', title: 'PERSONAL OUTFIT', korean: '취향 맞춤 코디', description: '체형, 좋아하는 색과 무드로\n오늘 나에게 가장 잘 어울리는 룩을 찾아요.', label: 'STYLE × AI', href: '#/outfits', image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1050&q=85', color: 'plum' },
  { number: '02', title: 'SMART COMPARISON', korean: '같은 상품, 한눈에 비교', description: '브랜드와 상품 옵션을 매칭해\n판매처별 가격을 보기 쉽게 모아드려요.', label: 'CRAWL × MATCH', href: '#/compare', image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1050&q=85', color: 'clay' },
  { number: '03', title: 'PRICE MOMENT', korean: '스마트 구매 타이밍', description: '가격 이력을 차곡차곡 살펴\n조금 더 현명한 쇼핑의 순간을 찾아요.', label: 'RPA × PRICE DATA', href: '#/price', image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1050&q=85', color: 'olive' },
]

export default function HomePage() {
  const [stampSpinning, setStampSpinning] = useState(false)
  return <main>
    <section className="hero-shell">
      <div className="hero-copy">
        <p className="eyebrow"><span className="eyebrow-line" />YOUR STYLE, IN YOUR OWN WAY</p>
        <h1>취향을 입고,<br /><em>나답게 빛나다.</em></h1>
        <p className="hero-description">옷장 속 작은 고민부터 새로운 발견까지.<br />ONFIT이 당신만의 스타일을 세심하게 큐레이션합니다.</p>
        <div className="hero-ctas"><a className="button button-dark" href="#/style">나의 스타일 찾기 <Icon name="ArrowRight" size={17} /></a><a className="text-link" href="#projects">ONFIT 둘러보기 <Icon name="ArrowDownRight" size={16} /></a></div>
        <div className="hero-caption"><span>01</span><i /> PERSONAL STYLE, CONSIDERED</div>
      </div>
      <div className="hero-visual">
        <img src="https://images.unsplash.com/photo-1635360433659-3d56acc9fbb6?auto=format&fit=crop&w=1400&q=90" alt="도시적인 레드 룩을 입은 패션 모델" fetchPriority="high" />
        <div className="hero-photo-overlay" />
        <div className="hero-edition"><span>ONFIT</span><span>NO. 01 / 2026</span></div>
        <div className="hero-note"><span className="note-star">✳</span><small>CURATED FOR YOU</small><strong>Own your<br />everyday.</strong><a href="#/style">DISCOVER <Icon name="ArrowRight" size={12} /></a></div>
        <button className={`hero-stamp${stampSpinning ? ' is-spinning' : ''}`} type="button" aria-label={`Find your fit ${stampSpinning ? '회전 멈추기' : '회전 시작하기'}`} aria-pressed={stampSpinning} onClick={() => setStampSpinning((spinning) => !spinning)}><span>FIND</span><strong>YOUR<br />FIT</strong><i>✦</i></button>
      </div>
      <div className="hero-index"><span>01</span><i /><span>03</span></div>
    </section>

    <div className="brand-marquee"><span>STYLE THAT FEELS LIKE YOU</span><i>✳</i><span>BETTER FIT, BETTER DAYS</span><i>✳</i><span>STYLE THAT FEELS LIKE YOU</span><i>✳</i><span>BETTER FIT, BETTER DAYS</span></div>

    <section className="intro-section section-wrap">
      <div className="section-kicker"><span>THE ONFIT EDIT</span><i /></div>
      <div className="intro-content"><h2>유행보다 먼저,<br /><em>당신의 감각을</em> 알아보는 곳.</h2><div className="intro-side"><p>좋아하는 무드와 매일의 생활을 읽어<br className="desktop-break" /> 옷과 신발, 액세서리까지 나에게 어울리는 선택으로 연결합니다.</p><a className="text-link" href="#/style">나의 취향 진단하기 <Icon name="ArrowRight" size={15} /></a></div></div>
      <div className="intro-stats"><div><strong>01</strong><span>나를 알아가는 스타일 프로필</span></div><div><strong>02</strong><span>매일 입고 싶은 코디 큐레이션</span></div><div><strong>03</strong><span>가격까지 살펴보는 스마트 쇼핑</span></div></div>
    </section>

    <section className="projects-section" id="projects">
      <div className="section-wrap"><div className="section-heading"><div><p className="eyebrow">A MORE PERSONAL WAY TO SHOP</p><h2>ONFIT이 찾아낸<br /><em>당신만의 세 가지 감각</em></h2></div><p>스타일을 찾고, 아이템을 고르고,<br />가장 좋은 순간에 만나 보세요.</p></div>
        <div className="project-grid">{projects.map((project) => <a className={`project-card project-${project.color}`} href={project.href} key={project.number}>
          <div className="project-image"><img src={project.image} alt="" loading="lazy" /><span className="project-number">{project.number} <i /> ONFIT PROJECT</span><span className="project-arrow"><Icon name="ArrowUpRight" size={19} /></span><span className="project-label">{project.label}</span></div>
          <div className="project-info"><div><span className="eyebrow">{project.title}</span><h3>{project.korean}</h3><p>{project.description.split('\n').map((line) => <span key={line}>{line}<br /></span>)}</p></div><span className="project-link">EXPLORE <Icon name="ArrowRight" size={14} /></span></div>
        </a>)}</div>
      </div>
    </section>

    <section className="edit-section section-wrap">
      <div className="edit-heading"><div><p className="eyebrow">THE EDIT · 2026 SPRING</p><h2>이번 주, <em>나를 위한 발견</em></h2></div><a className="text-link" href="#/outfits">더 많은 아이템 <Icon name="ArrowRight" size={15} /></a></div>
      <div className="product-grid">{mockProducts.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div>
      <p className="demo-note">화면 시안을 위한 예시 상품과 가격입니다. 실제 상품 정보는 판매처 데이터 연동 후 제공됩니다.</p>
    </section>

    <section className="price-feature section-wrap">
      <div className="price-feature-copy"><p className="eyebrow"><span className="eyebrow-line" />SMART SHOPPING, SOFTLY</p><h2>좋아하는 마음은<br />지금, <em>가격은 한 번 더.</em></h2><p>관심 있는 아이템의 가격 흐름을 살펴보고<br />나에게 좋은 구매 타이밍을 찾아보세요.</p><a className="button button-cream" href="#/price">가격 인사이트 보기 <Icon name="ArrowRight" size={16} /></a><small>* 시연용 가격 데이터가 포함되어 있습니다.</small></div>
      <div className="price-feature-art"><div className="price-card"><div className="price-card-top"><span>PRICE WATCH · SAMPLE</span><span className="price-dot"><i /> DEMO INSIGHT</span></div><div className="price-item"><div className="price-mini-image"><img src={mockProducts[1].image} alt="가죽 토트백" loading="lazy" /></div><div><span>ONFIT SELECT · BAG</span><strong>Everyday Leather Tote</strong><small>가격 흐름 예시를 보여드려요</small></div></div><PriceTrendChart /><div className="price-card-bottom"><div><span>샘플 최저가</span><strong>₩178,000</strong></div><div className="deal-pill">시연용 <b>예시 데이터</b></div><Icon name="ArrowUpRight" size={18} /></div></div><div className="price-orbit">PRICE<br /><b>JOURNAL</b><span>✳</span></div></div>
    </section>

    <section className="closing-cta"><div className="closing-ornament">O</div><p className="eyebrow">YOUR NEXT FAVORITE LOOK IS HERE</p><h2>오늘의 나에게<br /><em>가장 잘 어울리는 핏.</em></h2><a className="button button-cream" href="#/style">나의 스타일 시작하기 <Icon name="ArrowRight" size={16} /></a><span className="closing-note">FIND YOUR OWN FIT · ONFIT</span></section>
  </main>
}
