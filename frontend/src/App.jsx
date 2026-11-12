import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { saveLoginSession, restoreLoginSession } from './services/authSession.js'
import { clearFittingMeasurements } from './services/fitting.js'
import Header from './components/common/Header.jsx'
import Footer from './components/common/Footer.jsx'
import AuthModal from './components/common/AuthModal.jsx'
import ScrollToTopButton from './components/common/ScrollToTopButton.jsx'
import HomePage from './pages/HomePage.jsx'
import StyleProfilePage from './pages/StyleProfilePage.jsx'
import OutfitPage from './pages/OutfitPage.jsx'
import WardrobePage from './pages/WardrobePage.jsx'
import PriceTimingPage from './pages/PriceTimingPage.jsx'
import PriceComparePage from './pages/PriceComparePage.jsx'
import SeasonalOutfitPage from './pages/SeasonalOutfitPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import MyPage from './pages/MyPage.jsx'
import { notifyAuthenticationChanged } from './services/auth.js'
const FittingPage = lazy(() => import('./pages/FittingPage.jsx'))

function readRoute() {
  const value = window.location.hash.replace(/^#/, '')
  return value.startsWith('/') ? value : '/home'
}

const pages = {
  '/fitting': FittingPage,
  '/home': HomePage,
  '/style': StyleProfilePage,
  '/outfits': OutfitPage,
  '/wardrobe': WardrobePage,
  '/price': PriceTimingPage,
  '/compare': PriceComparePage,
  '/seasonal': SeasonalOutfitPage,
  '/admin': AdminPage,
  '/mypage': MyPage,
}

export default function App() {
  const [route, setRoute] = useState(readRoute)
  const [authMode, setAuthMode] = useState(null)
  const [session, setSession] = useState(null)
  const [restoring, setRestoring] = useState(true)
  const [restoreError, setRestoreError] = useState('')
  const [restoreAttempt, setRestoreAttempt] = useState(0)
  const restoreController = useRef(null)
  const authRevision = useRef(0)
  function updateSession(next) {
    const saved = saveLoginSession(next)
    if (session?.user?.id && session.user.id !== next?.user?.id) clearFittingMeasurements(session.user.id)
    authRevision.current += 1
    restoreController.current?.abort()
    setSession(saved); setRestoring(false); setRestoreError('')
    notifyAuthenticationChanged()
  }
  useEffect(() => {
    const controller = new AbortController()
    restoreController.current = controller
    const revision = authRevision.current
    const timeout = setTimeout(() => controller.abort(), 15000)
    let active = true
    setRestoring(true); setRestoreError('')
    restoreLoginSession(fetch, undefined, controller.signal).then(restored => {
      if (active && revision === authRevision.current) setSession(restored)
    }).catch(() => {
      if (active && revision === authRevision.current) setRestoreError('로그인 확인이 지연되고 있습니다.')
    }).finally(() => {
      clearTimeout(timeout)
      if (active && revision === authRevision.current) setRestoring(false)
    })
    return () => { active = false; clearTimeout(timeout); controller.abort() }
  }, [restoreAttempt])
  useEffect(() => {
    if (!session?.expires_at) return
    const timeout = setTimeout(() => updateSession(null), Math.max(0, session.expires_at - Date.now()))
    return () => clearTimeout(timeout)
  }, [session])
  useEffect(() => {
    const handleRoute = () => {
      setRoute(readRoute())
      if (window.location.hash === '#projects') requestAnimationFrame(() => document.getElementById('projects')?.scrollIntoView())
      else window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    window.addEventListener('hashchange', handleRoute)
    return () => window.removeEventListener('hashchange', handleRoute)
  }, [])
  const Page = pages[route] || HomePage
  const adminDenied = route === '/admin' && (session?.auth_type !== 'admin' || session?.user?.is_admin !== true)
  if (restoring) return <main className="inner-page"><p role="status">로그인 상태 확인 중…</p></main>
  return <div className="app-shell min-h-screen bg-canvas text-ink">
    <Header onAuth={setAuthMode} session={session} onLogout={() => updateSession(null)} />
    {restoreError && <div role="status">{restoreError} <button type="button" onClick={() => setRestoreAttempt(value => value + 1)}>다시 확인</button></div>}
    <Suspense fallback={<p role="status">화면을 불러오는 중입니다.</p>}>
      {adminDenied ? <main className="inner-page"><section className="section-wrap"><h1>관리자 전용 화면입니다</h1><p>{session ? '이 계정에는 관리자 권한이 없습니다.' : '관리자 계정으로 로그인해 주세요.'}</p>{!session && <button className="button button-dark" onClick={() => setAuthMode('login')}>관리자 로그인</button>} <a href="#/home">홈으로</a></section></main> : <Page session={route === '/admin' || session?.auth_type !== 'admin' ? session : null} onSessionChange={updateSession} onRequestLogin={() => setAuthMode('login')} />}
    </Suspense>
    <Footer />
    <ScrollToTopButton />
    <AuthModal key={authMode || 'closed'} mode={authMode} onClose={(nextMode) => setAuthMode(nextMode || null)} onAuthenticated={updateSession} />
  </div>
}
