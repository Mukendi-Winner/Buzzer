import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        id: '/',
        name: 'Buzzer Genie En Herbe',
        short_name: 'Buzzer',
        description: 'Real-time buzzer game for host and player devices.',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#8a4f8f',
        icons: [
          {
            src: '/pwa/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/pwa/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
    react(),
  ],
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
      '/health': {
        target: 'http://localhost:3001',
      },
    },
  },
})
