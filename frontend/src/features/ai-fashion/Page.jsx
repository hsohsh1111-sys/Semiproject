import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import App from './App.jsx'
import appCss from './App.css?inline'
import mobileCss from './components/MobileCamera.css?inline'
import landingCss from './components/LandingPage.css?inline'
import integrationCss from './Integration.css?inline'

const styles = [appCss, mobileCss, landingCss, integrationCss].join('\n')

export default function AiFashionPage({ active = true }) {
  const hostRef = useRef(null)
  const [shadowRoot, setShadowRoot] = useState(null)

  useLayoutEffect(() => {
    const host = hostRef.current
    setShadowRoot(host.shadowRoot || host.attachShadow({ mode: 'open' }))
  }, [])

  return <div ref={hostRef} className="ai-fashion-host">
    {shadowRoot && createPortal(<><style>{styles}</style><App active={active} /></>, shadowRoot)}
  </div>
}
