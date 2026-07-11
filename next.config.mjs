import withPWA from 'next-pwa'

const pwaConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  // Disable PWA in development to avoid confusion
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    // Static assets — cache-first
    {
      urlPattern: /^https?:\/\/.*\.(js|css|woff2?|png|jpg|svg|ico)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    // Seed data GET endpoints — network-first with IndexedDB fallback handled in app
    {
      urlPattern: /\/api\/(products|customers|price-groups|float|cashup)/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-seed-data',
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 6 },
      },
    },
    // Other API GET calls — network-first
    {
      urlPattern: /\/api\/(purchases|sales|expenses|stock)/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-data',
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
      },
    },
    // Next.js pages — network-first
    {
      urlPattern: /\/app\/.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages',
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
  ],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets Electron bundle a self-contained server (.next/standalone) instead
  // of shipping the full dev tree + node_modules — see electron/main.js and
  // the SaaS plan section C.1. Vercel tolerates this setting fine; it uses
  // its own build output API regardless of `output`.
  output: 'standalone',
}

export default pwaConfig(nextConfig)
