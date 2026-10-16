// 별운관 운세지 — 서비스 워커
//
// 캐시 전략: 실행에 필요한 파일을 설치 시점에 모두 받아 두고(precache) 캐시에서 먼저 응답한다.
// → 전시장 인터넷이 끊겨도 설치된 앱은 그대로 동작한다.
//
// 업데이트 전략: 새 버전은 설치만 해 두고 '대기' 상태로 둔다(skipWaiting 자동 호출 안 함).
// 페이지(src/js/pwa.js)가 시작 화면처럼 안전한 시점에 SKIP_WAITING을 보내면 그때 교체·새로고침한다.
// → 관람객이 체험하는 도중에는 절대 강제로 새로고침되지 않는다.
//
// VERSION은 GitHub Actions 배포 때 커밋 SHA로 바뀐다(.github/workflows/pages.yml).
// 이 파일 내용이 바뀌어야 브라우저가 새 버전을 감지하므로, 로컬 값은 그대로 두면 된다.

const VERSION = 'local-dev';
const CACHE_PREFIX = 'fortune-slip-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/css/tokens.css',
  './src/css/base.css',
  './src/css/components.css',
  './src/css/pages.css',
  './src/js/app.js',
  './src/js/pwa.js',
  './src/js/stage.js',
  './src/js/data/demo-result.js',
  './src/js/domain/birthdate.js',
  './src/js/domain/date-utils.js',
  './src/js/domain/fortune-repo.js',
  './src/js/domain/star-resolver.js',
  './src/js/ui/birth-form.js',
  './src/js/ui/calendar-select.js',
  './src/js/ui/help-modal.js',
  './src/js/ui/star-icon.js',
  './vendor/korean-lunar-calendar/korean-lunar-calendar.js',
  './public/assets/bg-01.png',
  './public/assets/logo.svg',
  './public/assets/icon-s.svg',
  './public/fonts/maru-buri/MaruBuri-Regular.woff2',
  './public/fonts/maru-buri/MaruBuri-SemiBold.woff2',
  './public/fonts/maru-buri/MaruBuri-Bold.woff2',
  './public/fonts/pretendard/PretendardVariable.woff2',
  './public/icons/icon-192.png',
  './public/icons/icon-512.png',
  './public/icons/icon-maskable-192.png',
  './public/icons/icon-maskable-512.png',
  './public/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // HTTP 캐시를 건너뛰고 서버에서 새로 받아, 새 버전 캐시에 옛 파일이 섞이지 않게 한다.
    await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_VERSION' && event.ports[0]) {
    event.ports[0].postMessage({ version: VERSION });
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 페이지 이동(?dev=1 포함)은 항상 캐시된 index.html로 응답
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match('./index.html');
      if (cached) return cached;
      return fetch(request);
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    return fetch(request);
  })());
});
