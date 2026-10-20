import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Relative base so the built app also works from a file server, a subfolder on GitHub
// Pages, or inside a Tauri desktop shell without being rebuilt for each.
export default defineConfig({
  base: './',
  // Its own port: this app is meant to run side by side with the baseline Artifact
  // Viewer on 5178, and `strictPort` makes a collision an error rather than a silent
  // hop to another port that every verify script would then miss.
  server: { port: 5179, strictPort: true },
  preview: { port: 4179, strictPort: true },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Artifact Reflection Viewer',
        short_name: 'Reflection',
        description: 'Museum artifact viewer — stage a scan against dark acrylic so its reflection overlays the print.',
        theme_color: '#030304',
        background_color: '#030304',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // three.js and the app bundle are well over the 2 MB default, and caching them is
        // exactly what makes the viewer work with no network.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      devOptions: {
        // Keeps the service worker out of the way during development.
        enabled: false,
      },
    }),
  ],
})