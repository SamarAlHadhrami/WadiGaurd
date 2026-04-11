const STATIC_CACHE = 'wadi-guard-static-v2'
const RUNTIME_CACHE = 'wadi-guard-runtime-v2'
const APP_SHELL = ['/', '/manifest.webmanifest', '/pwa-192.png', '/pwa-512.png', '/data/oman_regions.geojson', '/data/oman_regions_adm2.geojson']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  )
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  )
  event.waitUntil(self.clients.claim())
})

const isCacheableGet = (request) => request.method === 'GET'

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (!isCacheableGet(request)) return

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) return response

          const responseClone = response.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone)).catch(() => undefined)
          return response
        })
        .catch(() => cachedResponse)

      if (cachedResponse) return cachedResponse
      return networkFetch
    })
  )
})
