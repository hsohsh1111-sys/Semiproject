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
const FittingPage = lazy(() => import('./pages/FittingPage.jsx'))
const AiFashionPage = lazy(() => import('./features/ai-fashion/Page.jsx'))

function readRoute() {
  const value = window.location.hash.replace(/^#/, '')
  if (value.startsWith('/')) return value
  return window.location.pathname.replace(/\/+$/, '') === '/ai-fashion' ? '/ai-fashion' : '/home'
}

const pages = {
  '/fitting': FittingPage,
  '/ai-fashion': AiFashionPage,
  '/home': HomePage,
  '/style': StyleProfilePage,
  '/outfits': OutfitPage,
  '/wardrobe': WardrobePage,
  '/price': PriceTimingPage,
  '/compare': PriceComparePage,
  '/seasonal': SeasonalOutfitPage,
  '/admin': AdminPage,
}

export default function App() {
  const [route, setRoute] = useState(readRoute)
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 769px)').matches)
  const [hasPcAiFashion, setHasPcAiFashion] = useState(() =>
    window.matchMedia('(min-width: 769px)').matches && readRoute() === '/ai-fashion')
  const [authMode, setAuthMode] = useState(null)
  const [session, setSession] = useState(null)
  const [restoring, setRestoring] = useState(true)
  const [restoreError, setRestoreError] = useState('')
  const [restoreAttempt, setRestoreAttempt] = useState(0)
  const restoreController = useRef(null)
  const authRevision = useRef(0)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 769px)')
    const update = () => setIsDesktop(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!isDesktop) setHasPcAiFashion(false)
    else if (route === '/ai-fashion') setHasPcAiFashion(true)
  }, [isDesktop, route])
  useEffect(() => {
    const handlePcAiFashionLink = (event) => {
      if (!window.matchMedia('(min-width: 769px)').matches || event.defaultPrevented || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.composedPath().find((node) => node instanceof HTMLAnchorElement)
      if (!link || (link.target && link.target !== '_self')) return
      const href = link.getAttribute('href')
      if (href === '/ai-fashion/' || (href === '/#/home' && readRoute() === '/ai-fashion')) {
        event.preventDefault()
        window.location.hash = href === '/ai-fashion/' ? '/ai-fashion' : '/home'
      }
    }
    document.addEventListener('click', handlePcAiFashionLink, true)
    return () => document.removeEventListener('click', handlePcAiFashionLink, true)
  }, [])
  function updateSession(next) {
    const saved = saveLoginSession(next)
    if (session?.user?.id && session.user.id !== next?.user?.id) clearFittingMeasurements(session.user.id)
    authRevision.current += 1
    restoreController.current?.abort()
    setSession(saved); setRestoring(false); setRestoreError('')
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
      if (window.location.pathname.replace(/\/+$/, '') === '/ai-fashion' && window.location.hash) {
        window.history.replaceState(window.history.state, '', `/${window.location.hash}`)
      }
      setRoute(readRoute())
      if (window.location.hash === '#projects') requestAnimationFrame(() => document.getElementById('projects')?.scrollIntoView())
      else window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    window.addEventListener('hashchange', handleRoute)
    return () => window.removeEventListener('hashchange', handleRoute)
  }, [])
  const Page = pages[route] || HomePage
  const showAiFashion = route === '/ai-fashion'
  const retainPcAiFashion = showAiFashion || (isDesktop && hasPcAiFashion)
  if (restoring) return <main className="inner-page"><p role="status">로그인 상태 확인 중…</p></main>
  return <div className="app-shell min-h-screen bg-canvas text-ink">
    <Header onAuth={setAuthMode} session={session} onLogout={() => updateSession(null)} />
    {restoreError && <div role="status">{restoreError} <button type="button" onClick={() => setRestoreAttempt(value => value + 1)}>다시 확인</button></div>}
    <Suspense fallback={<p role="status">화면을 불러오는 중입니다.</p>}>
      {!showAiFashion && <Page session={session} onSessionChange={updateSession} onRequestLogin={() => setAuthMode('login')} />}
      {retainPcAiFashion && <div hidden={!showAiFashion}><AiFashionPage active={showAiFashion} /></div>}
    </Suspense>
    <Footer />
    <ScrollToTopButton />
    <AuthModal mode={authMode} onClose={(nextMode) => setAuthMode(nextMode || null)} onAuthenticated={updateSession} />
  </div>
}
