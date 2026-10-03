import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['representative-efficient-glasgow-legends.trycloudflare.com'],
    proxy: {
      '/api': {
        target: process.env.DEV_API_TARGET || 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
