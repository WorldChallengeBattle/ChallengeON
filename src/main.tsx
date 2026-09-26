import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import { MiniKit } from '@worldcoin/minikit-js'
import { LanguageProvider } from './i18n'

const miniKitAppId = import.meta.env.VITE_MINIKIT_APP_ID || import.meta.env.VITE_WORLD_APP_ID || undefined;

// World ID MiniKit 초기화 (오류 발생 시 앱 중단 방지)
try {
  MiniKit.install(miniKitAppId)
  if (!miniKitAppId) {
    console.warn('[🌍] MiniKit appId is not configured. Set VITE_MINIKIT_APP_ID to match your World App app.');
  }
  console.log("[🌍] MiniKit installed successfully");
} catch (error) {
  console.error("[⚠️] MiniKit installation failed:", error);
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <LanguageProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LanguageProvider>
    </StrictMode>,
  )
}
