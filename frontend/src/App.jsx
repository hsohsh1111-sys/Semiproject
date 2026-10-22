import { useEffect, useState } from 'react'
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

function readRoute() {
  const value = window.location.hash.replace(/^#/, '')
  return value.startsWith('/') ? value : '/home'
}

const pages = {
  '/home': HomePage,
  '/style': StyleProfilePage,
  '/outfits': OutfitPage,
  '/wardrobe': WardrobePage,
  '/price': PriceTimingPage,
  '/compare': PriceComparePage,
}

export default function App() {
  const [route, setRoute] = useState(readRoute)
  const [authMode, setAuthMode] = useState(null)
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
  return <div className="app-shell min-h-screen bg-canvas text-ink">
    <Header onAuth={setAuthMode} />
    <Page />
    <Footer />
    <ScrollToTopButton />
    <AuthModal mode={authMode} onClose={(nextMode) => setAuthMode(nextMode || null)} />
  </div>
}
