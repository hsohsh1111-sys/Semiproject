import BrandMark from './BrandMark.jsx'

export default function Footer() {
  return <footer className="site-footer">
    <div className="footer-main"><BrandMark light />
      <p>나를 가장 나답게 입는 방법.<br />ONFIT이 당신의 다음 스타일을 함께 찾아요.</p>
      <div className="footer-links"><a href="#/style">스타일 진단</a><a href="#/outfits">코디 추천</a><a href="#/price">가격 인사이트</a><a href="#projects">프로젝트 소개</a></div>
    </div>
    <div className="footer-bottom"><span>© 2026 ONFIT STUDIO. ALL RIGHTS RESERVED.</span><span>PERSONAL STYLE, CONSIDERED.</span></div>
  </footer>
}
