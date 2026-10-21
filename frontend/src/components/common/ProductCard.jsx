import { useState } from 'react'
import Icon from './Icon.jsx'

export default function ProductCard({ product, index = 0 }) {
  const [saved, setSaved] = useState(false)
  return <article className="product-card" style={{ '--card-delay': `${index * 70}ms` }}>
    <a className="product-image-wrap" href="#/compare" aria-label={`${product.name} 자세히 보기`}>
      <img className="product-image" src={product.image} alt={product.name} loading="lazy" />
      <span className={`product-tag tag-${product.tone || 'warm'}`}>{product.tag}</span>
    </a>
    <button className={`favorite-button ${saved ? 'is-saved' : ''}`} aria-label={saved ? '찜 취소' : '찜하기'} onClick={() => setSaved(!saved)}><Icon name="Heart" size={17} /></button>
    <div className="product-meta"><span>{product.category}</span><span>ONFIT PICK</span></div>
    <a href="#/compare" className="product-name">{product.name}</a>
    <div className="product-price">₩{Number(product.price).toLocaleString('ko-KR')} <span>부터</span></div>
  </article>
}
