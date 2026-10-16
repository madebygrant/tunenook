import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      // The OS fetches install icons itself; the page never requests them.
      includeManifestIcons: false,
      manifest: {
        id: '/',
        name: 'TuneNook',
        short_name: 'TuneNook',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#06080c',
        theme_color: '#06080c',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        // Music lives in IndexedDB, not the HTTP cache.
        runtimeCaching: [],
      },
    }),
  ],
})
