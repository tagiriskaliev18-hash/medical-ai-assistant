// Service Worker for Medical AI Assistant (Offline-First First Aid & Doctor Skills)
const CACHE_NAME = 'doctor-ebm-v2';

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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Кэширование клинических ресурсов для автономной работы...');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[SW] Ошибка при предкэшировании части ресурсов', err);
      });
    })
  );
  self.skipWaiting();
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
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Never cache external API requests to LLM endpoints
  const url = new URL(event.request.url);
  if (
    url.hostname.includes('pollinations.ai') ||
    url.hostname.includes('groq.com') ||
    url.hostname.includes('openrouter.ai') ||
    url.pathname.includes('/api/chat')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cache successful local GET requests
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          event.request.method === 'GET' &&
          (url.origin === location.origin || url.hostname.includes('cdn'))
        ) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
