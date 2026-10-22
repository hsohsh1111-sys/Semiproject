import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: ['onfit3.onrender.com']
  }
})