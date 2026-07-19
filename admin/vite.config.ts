import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/')
          if (normalized.includes('/node_modules/react') || normalized.includes('/node_modules/react-dom')) {
            return 'react'
          }
          if (normalized.includes('/node_modules/react-router-dom')) {
            return 'react-router'
          }
          if (normalized.includes('/node_modules/socket.io-client')) {
            return 'socket'
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
      '/api': 'http://localhost:3001',
      '/images': 'http://localhost:3001',
    },
  },
})
