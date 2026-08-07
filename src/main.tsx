import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";
<<<<<<< HEAD
import { PostHogProvider } from '@posthog/react'
=======
>>>>>>> origin/main
import { Toaster } from 'sonner'
import "@github/spark/spark"

import App from './App.tsx'
import { DiscordCallback } from './components/DiscordCallback.tsx'
import { SpotifyCallback } from './components/SpotifyCallback.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'
import {
  getAnalyticsClient,
  initAnalytics,
  isAnalyticsEnabled,
} from './lib/analytics'

import "./main.css"
import "./styles/theme.css"
import "./index.css"

initAnalytics()

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
<<<<<<< HEAD
    <AppTree />
=======
    <Root />
    <Toaster theme="dark" position="bottom-right" richColors closeButton />
>>>>>>> origin/main
  </ErrorBoundary>
)
