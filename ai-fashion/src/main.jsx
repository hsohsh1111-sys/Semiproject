import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ShopChrome from './components/ShopChrome.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ShopChrome><App /></ShopChrome>
  </React.StrictMode>,
)
