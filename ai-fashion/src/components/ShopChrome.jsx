import React, { useEffect, useState } from 'react'
import './ShopChrome.css'

const nav = [
  ['관리자 데모', '#/admin'],
  ['3D 피팅', '#/fitting'],
  ['AI 패션 검색', '/ai-fashion/'],
  ['스타일 추천', '#/outfits'],
  ['시즌 코디', '#/seasonal'],
  ['나의 옷장', '#/wardrobe'],
  ['가격 인사이트', '#/price'],
]

const shopHome = import.meta.env.DEV && window.location.port === '5174'
  ? `${window.location.protocol}//${window.location.hostname}:5173/` : '/'
const shopLink = (hash) => `${shopHome}${hash}`

function BrandMark({ light = false }) {
  return <a className={`shop-brand${light ? ' is-light' : ''}`} href={shopLink('#/home')} aria-label="ONFIT 홈">
    <img src={`${import.meta.env.BASE_URL}onfit-mark.svg`} alt="" />
    <span><strong>ONFIT</strong><small>FIND YOUR OWN FIT</small></span>
  </a>
}

export default function ShopChrome({ children }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [favoriteCount, setFavoriteCount] = useState(0)

  useEffect(() => {
    const update = () => {
      try {
        const saved = JSON.parse(localStorage.getItem('onfit_seasonal_favorites') || '[]')
        setFavoriteCount(Array.isArray(saved) ? saved.length : 0)
      } catch { setFavoriteCount(0) }
    }
    update()
    window.addEventListener('storage', update)
    window.addEventListener('onfit-seasonal-favorites-change', update)
    return () => {
      window.removeEventListener('storage', update)
      window.removeEventListener('onfit-seasonal-favorites-change', update)
    }
  }, [])

  return <div className="shop-chrome">
    <div className="shop-announcement"><span>ONFIT PERSONAL EDIT</span><i /> 나만을 위한 스타일, 지금 시작해 보세요 <a href={shopLink('#/style')}>스타일 진단하기 →</a></div>
    <header className="shop-site-header">
      <button type="button" className="shop-menu-button" aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
        aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? '×' : '☰'}</button>
      <BrandMark />
      <nav className={`shop-main-nav${menuOpen ? ' is-open' : ''}`} aria-label="주요 메뉴">
        {nav.map(([label, href]) => <a key={href} href={href.startsWith('#') ? shopLink(href) : href} onClick={() => setMenuOpen(false)}>{label}</a>)}
        <a href={shopLink('#projects')} onClick={() => setMenuOpen(false)}>ONFIT 큐레이션</a>
      </nav>
      <div className="shop-header-actions">
        <a className="shop-icon-link shop-search-link" href={shopLink('#/outfits')} aria-label="스타일 둘러보기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>
        </a>
        <a className="shop-icon-link shop-bag-link" href={shopLink('#/wardrobe')} aria-label={`나의 옷장, 찜한 아이템 ${favoriteCount}개`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 8h16v13H4zM9 8V6a3 3 0 0 1 6 0v2" /></svg><b>{favoriteCount}</b>
        </a>
        <span className="shop-header-divider" />
        <a className="shop-auth-link" href={shopLink('#/home')} title="ONFIT 쇼핑몰에서 로그인">로그인</a>
        <a className="shop-signup-link" href={shopLink('#/home')} title="ONFIT 쇼핑몰에서 회원가입">회원가입 ↗</a>
      </div>
    </header>
    {children}
    <footer className="shop-site-footer">
      <div className="shop-footer-main">
        <BrandMark light />
        <p>나를 가장 나답게 입는 방법.<br />ONFIT이 당신의 다음 스타일을 함께 찾아요.</p>
        <div className="shop-footer-links">
          <a href={shopLink('#/style')}>스타일 진단</a><a href={shopLink('#/outfits')}>코디 추천</a>
          <a href={shopLink('#/price')}>가격 인사이트</a><a href={shopLink('#projects')}>프로젝트 소개</a>
        </div>
      </div>
      <div className="shop-footer-bottom"><span>© 2026 ONFIT STUDIO. ALL RIGHTS RESERVED.</span><span>PERSONAL STYLE, CONSIDERED.</span></div>
    </footer>
  </div>
}
