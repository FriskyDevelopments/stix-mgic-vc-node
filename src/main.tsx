import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";
import { Toaster } from 'sonner'
import "@github/spark/spark"

import App from './App.tsx'
import { DiscordCallback } from './components/DiscordCallback.tsx'
import { SpotifyCallback } from './components/SpotifyCallback.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'

import "./main.css"
import "./styles/theme.css"
import "./index.css"

function Root() {
  const path = window.location.pathname

  if (path === '/auth/discord/callback') {
    return (
      <DiscordCallback
        onAuthComplete={() => {
          window.location.replace('/')
        }}
        onAuthError={() => {
          window.location.replace('/')
        }}
      />
    )
  }

  if (path === '/spotify-callback') {
    return (
      <SpotifyCallback
        onAuthComplete={() => {
          window.location.replace('/')
        }}
        onAuthError={() => {
          window.location.replace('/')
        }}
      />
    )
  }

  return <App />
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <Root />
    <Toaster theme="dark" position="bottom-right" richColors closeButton />
  </ErrorBoundary>
)
