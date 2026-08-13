import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Single source of truth. The version used to be hardcoded here as well as in
// package.json, so the number shown in Settings drifted out of date whenever
// only one of the two was bumped.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  base: '/kfit/',
  define: {
    __APP_VERSION__: JSON.stringify(`v${pkg.version}`),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().replace('T', ' ').substring(0, 16) + ' UTC'),
  },
  build: {
    minify: 'esbuild'
  },
  plugins: [
    react(),
    VitePWA({
      injectRegister: 'auto',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192.png', 'pwa-512.png', 'robots.txt', 'chime.wav'],
      manifest: {
        name: 'kfit - Gym & Workout Logger',
        short_name: 'kfit',
        id: '/kfit/',
        start_url: '/kfit/',
        scope: '/kfit/',
        description: 'Minimal, fast, offline-first workout tracker',
        theme_color: '#090a0f',
        background_color: '#090a0f',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/kfit/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/kfit/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wav}'],
        // Adds the notificationclick handler for the rest-timer notification
        importScripts: ['sw-notifications.js']
      }
    })
  ]
});
