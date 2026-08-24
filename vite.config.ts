import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 与 SDK 共用同一份 i18next，才能改语言 / 注入中文包
  resolve: {
    dedupe: ['i18next', 'react-i18next', 'i18next-browser-languagedetector', 'react', 'react-dom'],
  },
})
