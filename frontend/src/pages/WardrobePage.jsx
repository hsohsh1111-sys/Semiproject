import { useState } from 'react'
import Icon from '../components/common/Icon.jsx'
import ProductCard from '../components/common/ProductCard.jsx'
import WardrobeSummary from '../components/wardrobe/WardrobeSummary.jsx'
import { mockProducts } from '../services/api.js'
export default function WardrobePage() {
  const [active, setActive] = useState('전체')
  const filters = ['전체', '상의', '가방', '신발', '액세서리']
  return <main className="inner-page"><div className="page-hero page-hero-lilac"><span className="eyebrow">03 / YOUR DIGITAL CLOSET</span><h1>가지고 있는 것부터<br /><em>새롭게 입기.</em></h1><p>좋아하는 아이템을 모아두고, 나만의 다음 조합을 발견해요.</p><span className="page-hero-mark">⌑</span></div>
    <section className="wardrobe-content section-wrap"><WardrobeSummary onExplore={() => document.getElementById('closet-edit')?.scrollIntoView({ behavior: 'smooth' })} /><div id="closet-edit" className="wardrobe-toolbar"><div><span className="eyebrow">YOUR SAVED EDIT</span><h2>찜한 아이템 <span>04</span></h2></div><button className="sort-button">추천순 <Icon name="ChevronDown" size={15} /></button></div><div className="wardrobe-filters">{filters.map((filter) => <button className={active === filter ? 'active' : ''} key={filter} onClick={() => setActive(filter)}>{filter}</button>)}</div><div className="product-grid">{mockProducts.filter((p) => active === '전체' || p.category.includes(({ 상의: 'TOP', 가방: 'BAG', 신발: 'SHOES', 액세서리: 'JEWELRY' })[active])).map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div></section>
  </main>
}
