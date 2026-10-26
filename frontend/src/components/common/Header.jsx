import { useState } from 'react'
import BrandMark from './BrandMark.jsx'
import Icon from './Icon.jsx'

const nav = [
  ['관리자 데모', '#/admin'],
  ['스타일 추천', '#/outfits'], ['나의 옷장', '#/wardrobe'], ['가격 인사이트', '#/price'],
]

export default function Header({ onAuth }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <>
      <div className="announcement"><span>ONFIT PERSONAL EDIT</span><i /> 나만을 위한 스타일, 지금 시작해 보세요 <a href="#/style">스타일 진단하기 <Icon name="ArrowRight" size={13} /></a></div>
      <header className="site-header">
        <button className="icon-button mobile-menu" aria-label="메뉴 열기" onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'X' : 'Menu'} /></button>
        <BrandMark />
        <nav className={`main-nav ${menuOpen ? 'main-nav-open' : ''}`} aria-label="주요 메뉴">
          {nav.map(([label, href]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
          <a href="#projects">ONFIT 큐레이션</a>
        </nav>
        <div className="header-actions">
          <a className="icon-button search-action" aria-label="스타일 둘러보기" href="#/outfits"><Icon name="Search" /></a>
          <a className="icon-button bag-action" aria-label="나의 옷장" href="#/wardrobe"><Icon name="ShoppingBag" /><b>0</b></a>
          <span className="header-divider" />
          <button className="text-action" onClick={() => onAuth('login')}>로그인</button>
          <button className="signup-button" onClick={() => onAuth('signup')}>회원가입 <Icon name="ArrowUpRight" size={14} /></button>
        </div>
      </header>
    </>
  )
}
