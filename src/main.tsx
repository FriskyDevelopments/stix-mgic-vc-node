import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";
import { PostHogProvider } from '@posthog/react'
import { Toaster } from 'sonner'
import App from './App.tsx'
import { DiscordCallback } from './components/DiscordCallback.tsx'
import { SpotifyCallback } from './components/SpotifyCallback.tsx'
import { NebuStudio } from './components/NebuStudio.tsx'
import { lazy, Suspense } from 'react'
import { ErrorFallback } from './ErrorFallback.tsx'
import {
  getAnalyticsClient,
  initAnalytics,
  isAnalyticsEnabled,
} from './lib/analytics'
import { isNebuStudioRoute } from './lib/nebu-host'

import "./main.css"

initAnalytics()

const OverlayStudio = lazy(() => import('./components/OverlayStudio').then(module => ({ default: module.OverlayStudio })))
const OverlayOutput = lazy(() => import('./components/OverlayStudio').then(module => ({ default: module.OverlayOutputView })))

function Root() {
  const path = window.location.pathname

  if (path === '/overlay-studio') return <Suspense fallback={<p>Opening Overlay Studio…</p>}><OverlayStudio /></Suspense>
  if (path === '/overlay-output') return <Suspense fallback={null}><OverlayOutput /></Suspense>
  if (path === '/ops') return <App />
  if (isNebuStudioRoute(path, window.location.hostname)) return <NebuStudio />

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

function AppTree() {
  const analyticsClient = getAnalyticsClient()
  const tree = (
    <>
      <Root />
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </>
  )

  if (isAnalyticsEnabled() && analyticsClient) {
    return <PostHogProvider client={analyticsClient}>{tree}</PostHogProvider>
  }

  return tree
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <AppTree />
  </ErrorBoundary>
)
