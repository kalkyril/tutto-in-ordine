import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'production-csp', apply: 'build',
    transformIndexHtml: html => html.replace("connect-src 'self' ws://localhost:5173 http://localhost:5173", "connect-src 'none'"),
  }],
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'chrome120' },
})
