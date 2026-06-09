import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@design': path.resolve(__dirname, '../Design'),
    },
  },
})
