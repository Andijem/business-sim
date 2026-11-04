import { defineConfig, type PluginOption } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';

// HTTPS нужен, чтобы телефон в той же Wi‑Fi сети считал страницу безопасной (иначе PWA не работает).
// Если в ./certs лежат сертификаты от mkcert (см. README), берём их — тогда телефон не ругается.
// Иначе включаем самоподписанный сертификат: игра откроется, но браузер покажет предупреждение.
const certKey = 'certs/key.pem';
const certFile = 'certs/cert.pem';
const hasMkcert = fs.existsSync(certKey) && fs.existsSync(certFile);
const https = hasMkcert ? { key: fs.readFileSync(certKey), cert: fs.readFileSync(certFile) } : undefined;

const plugins: PluginOption[] = [
  VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icons/*.png'],
    manifest: {
      name: 'Темка',
      short_name: 'Темка',
      description: 'Симулятор бизнеса: от ларька в Копеечкино до монополии в Капитальске',
      lang: 'ru',
      start_url: './',
      scope: './',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#bfe0ee',
      theme_color: '#2f6f62',
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,json}'] },
  }),
];
if (!hasMkcert) plugins.push(basicSsl());

export default defineConfig({
  base: './',
  plugins,
  server: { https, host: true, port: 5173 },
  preview: { https, host: true, port: 4173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
