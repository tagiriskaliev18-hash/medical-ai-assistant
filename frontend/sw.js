// Service Worker for Medical AI Assistant (Apple Minimalist Consilium)
const CACHE_NAME = 'doctor-apple-v6';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/clinical_engine.js',
  './js/medical_skills.js',
  './js/llm_client.js',
  './js/metronome.js',
  './js/speech.js',
  './js/tts.js',
  './js/procedures.js',
  './js/app.js',
  './assets/data/red_flags.json',
  './assets/data/clinical_protocols.json',
  './assets/data/procedures.json',
  './assets/data/calculators.json',
  './assets/data/emergency_drugs.json',
  './assets/data/lab_reference.json',
  './assets/data/drug_interactions.json',
  './assets/data/icd10.json',
  './assets/svg/anaphylaxis.svg',
  './assets/svg/bleeding.svg',
  './assets/svg/blood_pressure.svg',
  './assets/svg/burn.svg',
  './assets/svg/cpr.svg',
  './assets/svg/fast_stroke.svg',
  './assets/svg/heimlich.svg',
  './assets/svg/pulse.svg',
  './assets/svg/recovery_position.svg',
  './assets/svg/rice.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Кэширование клинических ресурсов (v6)...');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[SW] Ошибка предкэширования:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Удаление устаревшего кэша:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Bypass cache for external APIs & LLMs
  if (
    url.hostname.includes('pollinations.ai') ||
    url.hostname.includes('groq.com') ||
    url.hostname.includes('openrouter.ai') ||
    url.hostname.includes('openai.com') ||
    url.pathname.includes('/api/chat') ||
    url.pathname.includes('/api/health')
  ) {
    return;
  }

  // 2. Network-First strategy for HTML, JS and CSS to guarantee fresh updates
  const isDocumentOrScript = 
    event.request.mode === 'navigate' ||
    event.request.destination === 'document' ||
    event.request.destination === 'script' ||
    event.request.destination === 'style' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css');

  if (isDocumentOrScript) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
        })
    );
    return;
  }

  // 3. Cache-First with Network fallback for static images, SVGs, and JSON data
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          event.request.method === 'GET'
        ) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return networkResponse;
      });
    })
  );
});
