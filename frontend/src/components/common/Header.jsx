import { useEffect, useState } from 'react'
import BrandMark from './BrandMark.jsx'
import Icon from './Icon.jsx'
import FeatureSearch from './FeatureSearch.jsx'
import { AUTH_CHANGE_EVENT, getAccessToken } from '../../services/auth.js'
import { FAVORITES_CHANGE_EVENT, getSeasonalFavorites } from '../../services/seasonalFavorites.js'

const nav = [
  ['3D 피팅', '#/fitting'],
  ['AI 패션 검색', '/ai-fashion/'],
  ['스타일 추천', '#/outfits'], ['시즌 코디', '#/seasonal'], ['나의 옷장', '#/wardrobe'], ['가격 인사이트', '#/price'],
]

export default function Header({ onAuth, session, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [favoriteCount, setFavoriteCount] = useState(0)
  useEffect(() => {
    let requestId = 0
    const updateFavoriteCount = (event) => {
      try {
        if (event?.detail) {
          setFavoriteCount(event.detail.length)
          return
        }
        if (event?.type === AUTH_CHANGE_EVENT && getAccessToken()) setFavoriteCount(0)
        const currentRequest = ++requestId
        getSeasonalFavorites().then((favorites) => {
          if (currentRequest === requestId) setFavoriteCount(favorites.length)
        }).catch((error) => {
          console.error('찜한 아이템 수를 불러오지 못했습니다.', error)
        })
      } catch (error) {
        console.error('찜한 아이템 수를 불러오지 못했습니다.', error)
      }
    }
    updateFavoriteCount()
    window.addEventListener(FAVORITES_CHANGE_EVENT, updateFavoriteCount)
    window.addEventListener(AUTH_CHANGE_EVENT, updateFavoriteCount)
    window.addEventListener('storage', updateFavoriteCount)
    return () => {
      window.removeEventListener(FAVORITES_CHANGE_EVENT, updateFavoriteCount)
      window.removeEventListener(AUTH_CHANGE_EVENT, updateFavoriteCount)
      window.removeEventListener('storage', updateFavoriteCount)
    }
  }, [])
  return (
    <>
      <div className="announcement"><span>ONFIT PERSONAL EDIT</span><i /> 나만을 위한 스타일, 지금 시작해 보세요 <a href="#/style">스타일 진단하기 <Icon name="ArrowRight" size={13} /></a></div>
      <header className="site-header">
        <button className="icon-button mobile-menu" aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'X' : 'Menu'} /></button>
        <BrandMark />
        <nav className={`main-nav ${menuOpen ? 'main-nav-open' : ''}`} aria-label="주요 메뉴">
          {nav.map(([label, href]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
          <a href="#projects">ONFIT 큐레이션</a>
        </nav>
        <div className="header-actions">
          <FeatureSearch isAdmin={session?.auth_type === 'admin' && session.user?.is_admin === true} />
          <a className="icon-button bag-action" aria-label={`나의 옷장, 찜한 아이템 ${favoriteCount}개`} href="#/wardrobe"><Icon name="ShoppingBag" /><b>{favoriteCount}</b></a>
          <span className="header-divider" />
          {session ? <><span className="header-member" title={session.user?.name}>{session.user?.name || '회원'}님</span>{session.auth_type === 'admin' && session.user?.is_admin === true ? <a className="text-action" href="#/admin">관리자</a> : <a className="text-action" href="#/mypage">마이페이지</a>}<button className="text-action" onClick={onLogout}>로그아웃</button></> : <>
            <button className="text-action" onClick={() => onAuth('login')}>로그인</button>
            <button className="signup-button" onClick={() => onAuth('signup')}>회원가입 <Icon name="ArrowUpRight" size={14} /></button>
          </>}
        </div>
      </header>
    </>
  )
}
