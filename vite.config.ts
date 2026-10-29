import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 的網址是 https://<帳號>.github.io/tripweave/，必須與 repo 名稱一致
const BASE = '/tripweave/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'TripWeave 旅程重建',
        short_name: 'TripWeave',
        lang: 'zh-Hant',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#f3f4f6',
        theme_color: '#2563eb',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // MapLibre 的 worker 是 .mjs，需要一起預先快取；地圖圖磚不快取（不支援離線）
        globPatterns: ['**/*.{js,mjs,css,html,svg}'],
        runtimeCaching: [
          {
            // index 記錄資料產生日期，優先取得最新版
            urlPattern: ({ url }) => url.pathname.endsWith('/rail/v1/index.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'rail-index' },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/rail/v1/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'rail-tiles',
              expiration: { maxAgeSeconds: 30 * 24 * 60 * 60, maxEntries: 2000 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
})
