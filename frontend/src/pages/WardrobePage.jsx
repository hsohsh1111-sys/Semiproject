import { useEffect, useState } from 'react'
import Icon from '../components/common/Icon.jsx'
import ProductCard from '../components/common/ProductCard.jsx'
import WardrobeSummary from '../components/wardrobe/WardrobeSummary.jsx'
import { mockProducts } from '../services/api.js'
import { AUTH_CHANGE_EVENT, getAccessToken } from '../services/auth.js'
import { getSeasonalFavorites, removeSeasonalFavorite } from '../services/seasonalFavorites.js'
export default function WardrobePage() {
  const [active, setActive] = useState('전체')
  const [favoriteItems, setFavoriteItems] = useState([])
  const [favoriteError, setFavoriteError] = useState('')
  const filters = ['전체', '상의', '가방', '신발', '액세서리']
  useEffect(() => {
    let active = true
    const loadFavorites = async () => {
      if (getAccessToken()) setFavoriteItems([])
      try {
        const loadedFavorites = await getSeasonalFavorites()
        if (active) {
          setFavoriteItems(loadedFavorites)
          setFavoriteError('')
        }
      } catch (error) {
        if (active) setFavoriteError(error instanceof Error ? error.message : '찜한 코디를 불러오지 못했습니다.')
      }
    }
    loadFavorites()
    window.addEventListener(AUTH_CHANGE_EVENT, loadFavorites)
    return () => {
      active = false
      window.removeEventListener(AUTH_CHANGE_EVENT, loadFavorites)
    }
  }, [])

  const handleRemoveFavorite = async (id) => {
    try {
      setFavoriteItems(await removeSeasonalFavorite(id))
      setFavoriteError('')
    } catch (error) {
      setFavoriteError(error instanceof Error ? error.message : '찜한 코디를 삭제하지 못했습니다.')
    }
  }

  return <main className="inner-page"><div className="page-hero page-hero-lilac"><span className="eyebrow">03 / YOUR DIGITAL CLOSET</span><h1>가지고 있는 것부터<br /><em>새롭게 입기.</em></h1><p>좋아하는 아이템을 모아두고, 나만의 다음 조합을 발견해요.</p><span className="page-hero-mark">⌑</span></div>
    <section className="wardrobe-content section-wrap"><WardrobeSummary onExplore={() => document.getElementById('closet-edit')?.scrollIntoView({ behavior: 'smooth' })} />
      <section className="wardrobe-seasonal-favorites" aria-labelledby="saved-seasonal-title">
        <div className="wardrobe-toolbar">
          <div><span className="eyebrow">YOUR SAVED ITEMS</span><h2 id="saved-seasonal-title">찜한 아이템 <span>{favoriteItems.length}</span></h2></div>
          <a className="text-link" href="#/seasonal">시즌 코디 둘러보기 <Icon name="ArrowRight" size={15} /></a>
        </div>
        {favoriteError && <p className="seasonal-favorite-error" role="alert">{favoriteError}</p>}
        {favoriteItems.length ? (
          <div className="wardrobe-seasonal-grid">
            {favoriteItems.map((favorite) => (
              <article className="wardrobe-seasonal-card" key={favorite.id}>
                <div className="wardrobe-seasonal-image">
                  <img src={favorite.imageUrl} alt={favorite.title} loading="lazy" />
                  <span>{favorite.season} · {favorite.type}</span>
                  <button type="button" className="seasonal-favorite-button is-saved" aria-label={`${favorite.title} 찜 취소`} onClick={() => handleRemoveFavorite(favorite.id)}>
                    <Icon name="Heart" size={17} />
                  </button>
                </div>
                <div className="wardrobe-seasonal-copy">
                  <p>{favorite.lookTitle} <i /> {favorite.age} · {favorite.gender}</p>
                  <h3>{favorite.title}</h3>
                  <p>{favorite.vendor}</p>
                  {Number.isFinite(favorite.price) && <strong>{new Intl.NumberFormat('ko-KR', { style: 'currency', currency: favorite.currencyCode || 'KRW', maximumFractionDigits: 0 }).format(favorite.price)}</strong>}
                  {favorite.productUrl && <a className="text-link" href={favorite.productUrl} target="_blank" rel="noopener noreferrer">상품 보기 <Icon name="ArrowUpRight" size={13} /></a>}
                </div>
              </article>
            ))}
          </div>
        ) : !favoriteError ? (
          <p className="wardrobe-seasonal-empty">아직 찜한 아이템이 없어요. 시즌 코디에서 마음에 드는 상품을 찜해 보세요.</p>
        ) : null}
      </section>
      <div id="closet-edit" className="wardrobe-toolbar"><div><span className="eyebrow">CURATED FOR YOU</span><h2>ONFIT 추천 아이템</h2></div><button className="sort-button">추천순 <Icon name="ChevronDown" size={15} /></button></div><div className="wardrobe-filters">{filters.map((filter) => <button className={active === filter ? 'active' : ''} key={filter} onClick={() => setActive(filter)}>{filter}</button>)}</div><div className="product-grid">{mockProducts.filter((p) => active === '전체' || p.category.includes(({ 상의: 'TOP', 가방: 'BAG', 신발: 'SHOES', 액세서리: 'JEWELRY' })[active])).map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div></section>
  </main>
}
