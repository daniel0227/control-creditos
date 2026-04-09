import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT) || 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT) || 4173,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '*.railway.app',
      'control-creditos-production.up.railway.app'
    ],
  },
})
