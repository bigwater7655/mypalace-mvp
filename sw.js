const CACHE_NAME = 'mypalace-shell-v2'
const APP_SHELL_URLS = [
  './',
  './index.html',
  './site.webmanifest',
  './favicon.svg',
  './pwa/icon-192.png',
  './pwa/icon-512.png',
  './pwa/icon-512-maskable.png',
]
const OFFLINE_WARM_URLS = [
  './assets/manifest.json',
  './mobile_sam_image_encoder.onnx',
  './sam_onnx_example.onnx',
  './ort/ort-wasm-simd-threaded.asyncify.mjs',
  './ort/ort-wasm-simd-threaded.asyncify.wasm',
  './ort/ort-wasm-simd-threaded.jsep.mjs',
  './ort/ort-wasm-simd-threaded.jsep.wasm',
  './ort/ort-wasm-simd-threaded.jspi.mjs',
  './ort/ort-wasm-simd-threaded.jspi.wasm',
  './ort/ort-wasm-simd-threaded.mjs',
  './ort/ort-wasm-simd-threaded.wasm',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
          return Promise.resolve(false)
        }),
      ),
    ).then(() => self.clients.claim())
      .then(() => warmOfflineAssets()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  const requestUrl = new URL(request.url)
  if (requestUrl.origin !== self.location.origin) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html')),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse
        }

        const responseClone = networkResponse.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone))
        return networkResponse
      })
    }),
  )
})

async function warmOfflineAssets() {
  const cache = await caches.open(CACHE_NAME)

  await Promise.all(OFFLINE_WARM_URLS.map((url) => cacheUrl(cache, url)))

  try {
    const manifestResponse = await fetch('./assets/manifest.json', { cache: 'no-cache' })
    if (!manifestResponse.ok) {
      return
    }

    const manifest = await manifestResponse.json()
    if (!Array.isArray(manifest)) {
      return
    }

    const assetUrls = manifest.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return []
      }

      const urls = []
      if (typeof entry.glbPath === 'string' && entry.glbPath) {
        urls.push(`./${entry.glbPath.replace(/^\/+/, '')}`)
      }
      if (typeof entry.thumbnailPath === 'string' && entry.thumbnailPath) {
        urls.push(`./${entry.thumbnailPath.replace(/^\/+/, '')}`)
      }
      return urls
    })

    await Promise.all(assetUrls.map((url) => cacheUrl(cache, url)))
  } catch {
    // Offline warmup is best-effort only.
  }
}

async function cacheUrl(cache, url) {
  try {
    const response = await fetch(url, { cache: 'no-cache' })
    if (!response.ok) {
      return
    }
    await cache.put(url, response)
  } catch {
    // Skip failures so one missing file does not abort the whole warmup.
  }
}
