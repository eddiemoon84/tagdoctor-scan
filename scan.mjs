import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

// ─── 매체별 감지 패턴 정의 ───────────────────────────────────────────────────
// scriptPatterns: 메인 스크립트 URL 문자열 매칭 (중복 판정에 사용)
// matchScript:    커스텀 스크립트 매칭 함수 (scriptPatterns 외 추가 감지)
// eventPatterns:  이벤트 전송 URL 문자열 매칭
// matchEvent:     커스텀 이벤트 매칭 함수 (eventPatterns 외 추가 감지)
// requiredGlobal: 이 글로벌 변수가 있어야만 "설치됨"으로 판정 (null이면 제한 없음)

const TRACKERS = {
  meta_pixel: {
    name: 'Meta Pixel',
    scriptPatterns: [
      'connect.facebook.net/en_US/fbevents.js',
    ],
    // signals/config는 정상 동작의 일부이므로 scriptPatterns가 아닌 ID 추출 전용으로 분리
    idExtractionPatterns: ['connect.facebook.net/signals/config/'],
    eventPatterns: ['facebook.com/tr'],
    globals: ['fbq', '_fbq'],
    requiredGlobal: null,
    extractId: (url) => {
      const m = url.match(/config\/(\d+)/);
      return m ? m[1] : null;
    },
    // 이벤트명 추출: /tr/?id=...&ev=PageView
    extractEventName: (url) => {
      const m = url.match(/[?&]ev=([^&]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    },
  },
  ga4: {
    name: 'GA4',
    scriptPatterns: ['googletagmanager.com/gtag/js?id=G-'],
    eventPatterns: ['google-analytics.com/g/collect'],
    // 커스텀: /collect + tid=G- 패턴도 GA4 이벤트로 매칭
    matchEvent: (req) => {
      if (req.url.includes('/collect') && req.url.includes('tid=G-')) return true;
      return false;
    },
    globals: ['gtag', 'dataLayer'],
    requiredGlobal: null,
    extractId: (url) => {
      const m = url.match(/[?&]id=(G-[A-Z0-9]+)/);
      return m ? m[1] : null;
    },
    // 이벤트명 추출: /g/collect?tid=G-...&en=page_view
    extractEventName: (url) => {
      const m = url.match(/[?&]en=([^&]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    },
  },
  gtm: {
    name: 'GTM',
    scriptPatterns: ['googletagmanager.com/gtm.js?id=GTM-'],
    eventPatterns: [],
    globals: ['google_tag_manager'],
    requiredGlobal: null,
    extractId: (url) => {
      const m = url.match(/[?&]id=(GTM-[A-Z0-9]+)/);
      return m ? m[1] : null;
    },
  },
  naver: {
    name: '네이버 전환추적',
    scriptPatterns: ['wcs.naver.net/wcslog.js'],
    eventPatterns: [
      'wcs.naver.com',          // wcs_do() 비콘 전송 도메인
      'wcs.naver.net/wcslog.js?', // 기존 패턴 (일부 구현)
    ],
    globals: ['wcs', 'wcs_do', '_nasa'],
    requiredGlobal: null,
    extractId: (url) => {
      const m = url.match(/[?&]a=([^&]+)/);
      return m ? m[1] : null;
    },
  },
  kakao: {
    name: '카카오 픽셀',
    scriptPatterns: ['t1.kakaocdn.net/kakao_js_sdk/'],
    eventPatterns: [
      'action.adkakao.com',      // 기존 패턴
      'pixel.kakao.com',         // 기존 패턴
      'analytics.ad.daum.net',   // pageView 비콘 도메인
      'act.ds.kakao.com',        // 전환 비콘 도메인
      'bc.ad.daum.net',          // GTM 동적 주입 시 비콘 도메인
    ],
    globals: ['kakaoPixel'],
    // kakaoPixel 글로벌이 있어야만 카카오 "픽셀"로 판정
    requiredGlobal: 'kakaoPixel',
    extractId: () => null,
  },
  tiktok: {
    name: 'TikTok Pixel',
    scriptPatterns: ['analytics.tiktok.com/i18n/pixel/events.js'],
    eventPatterns: [
      'analytics.tiktok.com/api/v2/pixel',
      'analytics.tiktok.com/api/v1/pixel',
    ],
    globals: ['ttq'],
    requiredGlobal: null,
    extractId: (url) => {
      const m = url.match(/sdkid=([A-Z0-9]+)/i);
      return m ? m[1] : null;
    },
    extractEventName: (url) => {
      const m = url.match(/[?&]event=([^&]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    },
  },
  criteo: {
    name: 'Criteo OneTag',
    scriptPatterns: [
      'static.criteo.net/js/ld/ld.js',
    ],
    // 커스텀: 도메인 무관 — resourceType=script이고 path에 /ld.js + 쿼리에 a= 이면 Criteo
    matchScript: (req) => {
      if (req.resourceType === 'script' && /\/ld\.js\b/.test(req.url) && req.url.includes('a=')) {
        return true;
      }
      return false;
    },
    eventPatterns: ['dynamic.criteo.com'],
    // 커스텀: origin=onetag 포함 요청도 Criteo 이벤트
    matchEvent: (req) => {
      if (req.url.includes('origin=onetag')) return true;
      if (req.url.includes('criteo.com') && (req.resourceType === 'xhr' || req.resourceType === 'fetch')) return true;
      return false;
    },
    globals: ['criteo_q'],
    requiredGlobal: null,
    extractId: () => null,
  },
  dable: {
    name: 'Dable',
    scriptPatterns: ['ad.dable.io'],
    // 메인 로더(dablena.min.js)만 카운트 — 동적 번들(dablena-*.js, fp.min.js) 제외
    matchScript: (req) => {
      if (req.resourceType === 'script' && /dablena\.min\.js/i.test(req.url)) return true;
      return false;
    },
    eventPatterns: ['ad-log.dable.io'],
    // 커스텀: callback=_dbljs 또는 dable 도메인의 /visit? 요청
    matchEvent: (req) => {
      if (req.url.includes('callback=_dbljs')) return true;
      if (/dable\.io.*\/visit\?/.test(req.url)) return true;
      return false;
    },
    globals: ['dable', '_dbljs'],
    requiredGlobal: null,
    extractId: () => null,
  },
};

// ─── 처방 메시지 (8매체 × 3타입 + 카카오 SDK 전용 = 25개) ──────────────────

const PRESCRIPTIONS = {
  meta_pixel: {
    not_installed:
      'Meta Pixel이 설치되지 않았습니다\n메타(Facebook/Instagram) 광고의 전환 성과를 측정하려면 픽셀 설치가 필수입니다.\n\n✅ 설치 방법:\n• 카페24: [쇼핑몰 관리자] → [마케팅 센터] → [Facebook 채널] → 픽셀 ID 입력\n• 아임웹: [마케팅] → [외부 서비스 연동] → [Facebook 픽셀] → 픽셀 ID 입력\n• 고도몰: [마케팅] → [외부 스크립트 관리] → Head 영역에 픽셀 코드 붙여넣기\n• GTM 사용 시: [태그] → [새로 만들기] → [Meta Pixel] 템플릿 선택 → 픽셀 ID 입력\n\n픽셀 ID는 Meta 비즈니스 관리자(business.facebook.com) → [이벤트 관리자]에서 확인할 수 있습니다.',
    duplicate:
      'Meta Pixel이 중복 설치되어 있습니다\n같은 픽셀이 2번 이상 로드되면 전환 데이터가 중복 집계되어 광고 성과가 부풀려집니다. ROAS가 실제보다 높게 나올 수 있습니다.\n\n✅ 해결 방법:\n1. 카페24 Facebook 채널에서 자동 설치된 픽셀과 GTM에서 별도 설치한 픽셀이 동시에 있는지 확인하세요\n2. 하나만 남기고 나머지를 제거하세요 (GTM을 통한 관리를 권장합니다)\n3. 제거 후 Meta 이벤트 관리자 → [테스트 이벤트]에서 PageView가 1번만 발생하는지 확인하세요',
    no_event:
      'Meta Pixel 스크립트는 있으나 이벤트가 감지되지 않았습니다\n픽셀 코드는 로드되었지만 이벤트가 전송되지 않고 있습니다. 초기화 코드가 누락되었거나 실행 순서에 문제가 있을 수 있습니다.\n\n✅ 확인 방법:\n1. 브라우저에서 Meta Pixel Helper 확장 프로그램을 설치하고 사이트를 방문해보세요\n2. fbq(\'init\', \'픽셀ID\')와 fbq(\'track\', \'PageView\') 코드가 모두 있는지 확인하세요\n3. GTM에서 설치한 경우: 태그의 트리거가 \'All Pages\'로 설정되어 있는지 확인하세요',
  },
  ga4: {
    not_installed:
      'Google Analytics 4가 설치되지 않았습니다\n사이트 방문자 분석을 위해 GA4 설치를 권장합니다.\n\n✅ 설치 방법:\n• analytics.google.com에서 속성 생성 → 측정 ID(G-XXXXXXXXX) 발급\n• 카페24: [기본 설정] → [검색 엔진 최적화(SEO)] → Google 애널리틱스 ID 입력\n• 아임웹: [마케팅] → [외부 서비스 연동] → [Google Analytics] → 측정 ID 입력\n• GTM 사용 시: [태그] → [새로 만들기] → [Google 태그] → 측정 ID 입력 (권장)',
    duplicate:
      'GA4가 중복 설치되어 있습니다\n같은 측정 ID의 GA4가 2번 이상 로드되면 페이지뷰, 이벤트가 중복 집계됩니다. 실제 트래픽의 2배로 보이게 됩니다.\n\n✅ 해결 방법:\n1. 호스팅 관리자에서 직접 설치한 GA4와 GTM에서 별도 설치한 GA4가 동시에 있는지 확인하세요\n2. GTM을 통한 단일 설치로 통합하는 것을 권장합니다\n3. GA4 실시간 보고서에서 페이지뷰가 정상적으로 1번만 카운트되는지 확인하세요',
    no_event:
      'GA4 스크립트는 있으나 이벤트가 감지되지 않았습니다\ngtag.js는 로드되었지만 데이터 수집 요청이 감지되지 않았습니다.\n\n✅ 확인 방법:\n1. GA4 실시간 보고서(analytics.google.com)에서 현재 활성 사용자가 보이는지 확인하세요\n2. gtag(\'config\', \'G-XXXXXXXXX\') 코드가 있는지 확인하세요\n3. GTM에서 설치한 경우: Google 태그의 트리거가 \'All Pages\'로 설정되어 있는지 확인하세요\n4. 브라우저의 광고 차단 확장 프로그램이 GA를 차단하고 있을 수 있습니다',
  },
  gtm: {
    not_installed:
      'Google Tag Manager가 설치되지 않았습니다\nGTM을 사용하면 GA4, 메타 픽셀, 네이버 전환추적 등 모든 태그를 코드 수정 없이 한 곳에서 관리할 수 있습니다.\n\n✅ 설치 방법:\n• tagmanager.google.com에서 컨테이너 생성 → GTM ID(GTM-XXXXXXX) 발급\n• 카페24: [기본 설정] → [검색 엔진 최적화(SEO)] → Google Tag Manager ID 입력\n• 아임웹: [마케팅] → [외부 서비스 연동] → [Google Tag Manager] → GTM ID 입력\n• 직접 설치: <head>와 <body> 태그 바로 뒤에 GTM 코드 2개를 각각 붙여넣기',
    duplicate:
      'GTM 컨테이너가 중복 로드되고 있습니다\n같은 GTM 컨테이너가 2번 이상 로드되면 그 안의 모든 태그(GA4, 픽셀 등)가 전부 중복 실행됩니다.\n\n✅ 해결 방법:\n1. HTML 소스에 직접 삽입한 GTM 코드와 호스팅 플랫폼(카페24 등)에서 자동 삽입한 GTM 코드가 동시에 있는지 확인하세요\n2. 하나만 남기고 나머지를 제거하세요\n3. GTM 미리보기 모드(tagmanager.google.com → [미리보기])에서 태그 실행 상태를 확인할 수 있습니다',
    multi_container:
      '서로 다른 GTM 컨테이너가 복수 설치되어 있습니다\n대규모 사이트에서는 부서별·용도별로 GTM 컨테이너를 분리 운영하는 것이 일반적입니다.\n의도적 운영이 아니라면 하나로 통합하는 것을 권장합니다.\n\nℹ️ 확인 사항:\n1. 각 GTM 컨테이너의 용도를 확인하세요 (예: 마케팅용 / 개발용 / 대행사용)\n2. tagmanager.google.com에서 각 컨테이너에 어떤 태그가 포함되어 있는지 점검하세요\n3. 불필요한 컨테이너가 있다면 해당 GTM 코드를 사이트에서 제거하세요',
    no_event: null,
  },
  naver: {
    not_installed:
      '네이버 전환추적 공통태그가 설치되지 않았습니다\n네이버 검색광고의 전환 성과를 측정하려면 공통태그(wcslog.js) 설치가 필수입니다.\n\n✅ 설치 방법:\n1. searchad.naver.com 로그인 → [도구] → [전환추적 관리] → 공통태그 스크립트 발급\n2. 카페24: [기본 설정] → [검색 엔진 최적화(SEO)] → 네이버 공통태그 ID 입력\n3. 아임웹: [마케팅] → [외부 서비스 연동] → [네이버 공통태그] → ID 입력\n4. GTM: [태그] → [새로 만들기] → [커스텀 HTML] → 공통태그 스크립트 붙여넣기 + 트리거 All Pages',
    duplicate:
      '네이버 공통태그가 중복 설치되어 있습니다\nwcslog.js가 2번 이상 로드되면 전환이 중복 집계됩니다.\n\n✅ 해결 방법:\n1. 호스팅 관리자에서 설치한 공통태그와 GTM에서 별도 설치한 공통태그가 동시에 있는지 확인하세요\n2. 하나만 남기고 제거하세요\n3. 네이버 검색광고 → [도구] → [전환추적 관리]에서 전환이 정상 수집되는지 확인하세요',
    no_event:
      '네이버 전환추적 스크립트는 있으나 이벤트가 감지되지 않았습니다\nwcslog.js는 로드되었지만 전환 이벤트 전송이 감지되지 않았습니다.\n\n✅ 확인 방법:\n1. 스크립트 코드에서 wcs.inflow() 또는 wcs_do() 호출이 있는지 확인하세요\n2. 네이버 검색광고 → [도구] → [전환추적 관리]에서 \'스크립트 설치 확인\' 버튼을 클릭해 정상 작동 여부를 확인하세요\n3. 전환추적 스크립트가 공통태그보다 먼저 실행되고 있지 않은지 순서를 확인하세요',
  },
  kakao: {
    not_installed:
      '카카오 픽셀이 설치되지 않았습니다\n카카오모먼트(카카오 키워드/디스플레이) 광고의 전환 추적을 위해 카카오 픽셀 설치가 필요합니다.\n\n✅ 설치 방법:\n1. business.kakao.com → [광고 계정] → [도구] → [픽셀 & SDK] → 픽셀 생성\n2. 발급받은 픽셀 코드를 사이트 <head> 태그에 삽입\n3. GTM: [태그] → [새로 만들기] → [커스텀 HTML] → 카카오 픽셀 코드 붙여넣기\n4. 카페24/아임웹: 외부 스크립트 관리에서 Head 영역에 코드 삽입',
    not_installed_sdk_only:
      '카카오 JS SDK(로그인/공유)는 있으나 카카오 픽셀은 설치되지 않았습니다\n카카오 SDK와 카카오 픽셀은 별도의 제품입니다. 광고 전환 추적을 위해서는 픽셀을 별도로 설치해야 합니다.\n\n✅ 설치 방법:\n1. business.kakao.com → [광고 계정] → [도구] → [픽셀 & SDK] → 픽셀 생성\n2. 발급받은 픽셀 코드를 사이트 <head> 태그에 삽입\n3. GTM: [태그] → [새로 만들기] → [커스텀 HTML] → 카카오 픽셀 코드 붙여넣기\n4. 카페24/아임웹: 외부 스크립트 관리에서 Head 영역에 코드 삽입',
    duplicate:
      '카카오 픽셀이 중복 설치되어 있습니다\n이벤트가 중복 집계될 수 있습니다.\n카카오 SDK 초기화 코드를 확인하고 하나만 남겨 주세요.',
    no_event:
      '카카오 픽셀 SDK는 있으나 이벤트가 감지되지 않았습니다\nkakaoPixel 객체는 존재하지만 이벤트 전송이 감지되지 않았습니다. 초기화 후 pageView 호출이 누락되었을 수 있습니다.\n\n✅ 확인 방법:\n1. 스크립트에 kakaoPixel(\'픽셀ID\').pageView() 호출이 있는지 확인하세요\n2. 카카오 비즈니스 → [도구] → [픽셀 & SDK] → [이벤트 관리]에서 이벤트 수신 여부를 확인하세요\n3. 카카오 SDK(로그인/공유용)와 카카오 픽셀(광고 추적용)은 별도입니다. 둘 다 필요합니다',
  },
  tiktok: {
    not_installed:
      'TikTok Pixel이 설치되지 않았습니다\nTikTok 광고의 전환 추적을 위해 픽셀 설치가 필요합니다.\n\n✅ 설치 방법:\n1. ads.tiktok.com → [자산] → [이벤트] → [웹 이벤트] → 픽셀 생성\n2. \'수동 설치\' 선택 → 픽셀 코드를 <head> 태그에 삽입\n3. GTM: [태그] → [새로 만들기] → TikTok Pixel 템플릿 사용\n4. 설치 후 TikTok Pixel Helper 크롬 확장으로 작동 확인',
    duplicate:
      'TikTok Pixel이 중복 설치되어 있습니다\n중복 로드 시 이벤트가 이중으로 전송됩니다.\n하나의 설치 방식만 유지하세요.',
    no_event:
      'TikTok Pixel 스크립트는 로드되었으나 이벤트 전송이 감지되지 않았습니다.\nttq.load("PIXEL_ID") 및 ttq.page() 호출을 확인하세요.',
  },
  criteo: {
    not_installed:
      'Criteo OneTag가 설치되지 않았습니다\nCriteo 리타게팅 광고를 운영 중이라면 OneTag 설치가 필요합니다.\n\n✅ 설치 방법:\nCriteo 담당 매니저에게 OneTag 설치 코드를 요청하세요. 보통 GTM을 통해 설치하며, Criteo에서 GTM 템플릿을 제공합니다.',
    duplicate:
      'Criteo OneTag이 중복 설치되어 있습니다.\n중복 로드 시 광고 입찰 데이터가 왜곡될 수 있습니다.\n하나의 OneTag만 유지하세요.',
    no_event:
      'Criteo OneTag 스크립트는 로드되었으나 이벤트 전송이 감지되지 않았습니다.\ncriteo_q.push() 이벤트 호출 코드를 확인하세요.',
  },
  dable: {
    not_installed:
      'Dable 스크립트가 설치되지 않았습니다\nDable 네이티브 광고 또는 전환 추적을 사용하려면 스크립트 설치가 필요합니다.\n\n✅ 설치 방법:\n1. Dable 대시보드(dashboard.dable.io)에서 전환 추적 스크립트를 발급받으세요\n2. GTM: [태그] → [새로 만들기] → [커스텀 HTML] → Dable 스크립트 붙여넣기\n3. 직접 설치: <head> 또는 <body> 태그에 스크립트 삽입\n4. 설치 확인은 Dable 담당자에게 문의하세요',
    duplicate:
      'Dable 스크립트가 중복 설치되어 있습니다.\n중복 설치 시 추천 위젯 충돌이 발생할 수 있습니다.\n하나의 스크립트만 남겨 주세요.',
    no_event:
      'Dable 스크립트는 로드되었으나 로그 전송이 감지되지 않았습니다.\ndable 위젯 초기화 코드를 확인하세요.',
  },
};

// ─── 페이지 유형별 필수 이벤트 ────────────────────────────────────────────────

const PAGE_TYPE_REQUIRED_EVENTS = {
  home: {
    meta_pixel: ['PageView'],
    ga4: ['page_view'],
  },
  product: {
    meta_pixel: ['PageView', 'ViewContent'],
    ga4: ['page_view', 'view_item'],
  },
  cart: {
    meta_pixel: ['PageView', 'AddToCart'],
    ga4: ['page_view', 'add_to_cart'],
  },
  checkout: {
    meta_pixel: ['PageView', 'InitiateCheckout'],
    ga4: ['page_view', 'begin_checkout'],
  },
  thankyou: {
    meta_pixel: ['PageView', 'Purchase'],
    ga4: ['page_view', 'purchase'],
  },
  custom: {
    meta_pixel: ['PageView'],
    ga4: ['page_view'],
  },
};

const PAGE_TYPE_LABELS = {
  home: '🏠 메인 페이지',
  product: '📦 상품 상세',
  cart: '🛒 장바구니',
  checkout: '💳 결제',
  thankyou: '✅ 결제 완료',
  custom: '📄 페이지',
};

// ─── 매칭 헬퍼 ───────────────────────────────────────────────────────────────

function matchesScript(req, tracker) {
  // 1) 문자열 패턴 매칭
  if (tracker.scriptPatterns.some((p) => req.url.includes(p))) return true;
  // 2) 커스텀 매칭 함수
  if (tracker.matchScript && tracker.matchScript(req)) return true;
  return false;
}

function matchesEvent(req, tracker) {
  if (tracker.eventPatterns.some((p) => req.url.includes(p))) return true;
  if (tracker.matchEvent && tracker.matchEvent(req)) return true;
  return false;
}

// ─── 호스팅 플랫폼 감지 ──────────────────────────────────────────────────────

function detectHosting(htmlContent, requests) {
  const html = htmlContent.toLowerCase();
  const urls = requests.map((r) => r.url.toLowerCase()).join(' ');

  if (html.includes('cafe24') || urls.includes('cafe24.com') || urls.includes('echosting.cafe24')) {
    return { id: 'cafe24', name: '카페24' };
  }
  if (urls.includes('imweb.me') || html.includes('imweb')) {
    return { id: 'imweb', name: '아임웹' };
  }
  if (urls.includes('godo.co.kr') || html.includes('/data/goods/') || html.includes('<!-- godo -->')) {
    return { id: 'godo', name: '고도몰' };
  }
  if (urls.includes('makeshop.co.kr') || html.includes('makeshop')) {
    return { id: 'makeshop', name: '메이크샵' };
  }
  if (urls.includes('/wp-content/') || urls.includes('/wp-includes/') || /<meta[^>]+generator[^>]+wordpress/i.test(htmlContent)) {
    return { id: 'wordpress', name: 'WordPress' };
  }
  return { id: 'general', name: '일반' };
}

// ─── 메인 스캔 함수 ──────────────────────────────────────────────────────────

// 단일 페이지 로드 + 데이터 수집 (browser 재사용 가능)
async function collectPageData(browser, targetUrl) {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const networkRequests = [];
  page.on('request', (req) => {
    networkRequests.push({
      url: req.url(),
      resourceType: req.resourceType(),
    });
  });

  try {
    try {
      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (err) {
      if (err.message.includes('Timeout')) {
        networkRequests.length = 0;
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } else {
        throw new Error(`사이트 접속 실패: ${err.message}`);
      }
    }

    await page.waitForTimeout(3000);

    const allGlobalKeys = [
      ...new Set(Object.values(TRACKERS).flatMap((t) => t.globals)),
      'Kakao',
    ];
    const globalResults = await page.evaluate((keys) => {
      const result = {};
      for (const key of keys) {
        result[key] = typeof window[key] !== 'undefined';
      }
      return result;
    }, allGlobalKeys);

    const htmlContent = await page.content();

    return { networkRequests, globalResults, htmlContent };
  } finally {
    await context.close();
  }
}

// 수집된 데이터 + 페이지 유형으로 분석 결과 생성
function analyzePageData({ networkRequests, globalResults, htmlContent }, pageType) {
  const results = {};

  for (const [key, tracker] of Object.entries(TRACKERS)) {
    const scriptReqs = networkRequests.filter((req) => matchesScript(req, tracker));
    const eventReqs = networkRequests.filter((req) => matchesEvent(req, tracker));
    const hasGlobal = tracker.globals.some((g) => globalResults[g]);

    let detected = scriptReqs.length > 0 || hasGlobal;
    if (tracker.requiredGlobal && !globalResults[tracker.requiredGlobal]) {
      detected = false;
    }

    // ID 추출
    const ids = new Set();
    for (const req of scriptReqs) {
      const id = tracker.extractId(req.url);
      if (id) ids.add(id);
    }
    if (tracker.idExtractionPatterns) {
      for (const req of networkRequests) {
        if (tracker.idExtractionPatterns.some((p) => req.url.includes(p))) {
          const id = tracker.extractId(req.url);
          if (id) ids.add(id);
        }
      }
    }
    const uniqueIds = [...ids];

    // 이벤트명 추출
    const detectedEvents = [];
    if (tracker.extractEventName) {
      const seen = new Set();
      for (const req of eventReqs) {
        const evName = tracker.extractEventName(req.url);
        if (evName && !seen.has(evName)) {
          seen.add(evName);
          detectedEvents.push(evName);
        }
      }
    }

    // 필수 이벤트 검증 (페이지 유형 기준)
    let requiredEvents = null;
    const requiredList = PAGE_TYPE_REQUIRED_EVENTS[pageType]?.[key];
    if (requiredList && detected) {
      const missing = requiredList.filter((e) => !detectedEvents.includes(e));
      requiredEvents = {
        required: requiredList,
        detected: detectedEvents.filter((e) => requiredList.includes(e)),
        missing,
      };
    }

    // 중복 판정
    let isDuplicate = false;
    let isMultiContainer = false;
    const scriptLoadCount = scriptReqs.length;
    if (uniqueIds.length >= 2) {
      if (key === 'gtm') {
        isMultiContainer = true;
      } else {
        isDuplicate = true;
      }
    } else if (scriptLoadCount >= 2) {
      isDuplicate = true;
    }

    const hasEventFire = eventReqs.length > 0;

    let kakaoSdkOnly = false;
    if (key === 'kakao' && !detected && globalResults['Kakao']) {
      kakaoSdkOnly = true;
    }

    // 상태 결정 (required events 반영)
    let status;
    if (!detected) status = 'not_installed';
    else if (isDuplicate) status = 'duplicate';
    else if (isMultiContainer) status = 'multi_container';
    else if (requiredEvents && requiredEvents.missing.length === requiredEvents.required.length) {
      status = 'missing_events';
    }
    else if (requiredEvents && requiredEvents.missing.length > 0) status = 'partial_events';
    else status = 'ok';

    results[key] = {
      name: tracker.name,
      detected,
      scriptLoadCount,
      eventFireCount: eventReqs.length,
      hasEventFire,
      hasGlobal,
      isDuplicate,
      isMultiContainer,
      ids: uniqueIds,
      id: uniqueIds[0] || null,
      kakaoSdkOnly,
      detectedEvents,
      requiredEvents,
      status,
    };
  }

  // 점수 계산
  const detectedTags = Object.values(results).filter((r) => r.detected);
  const detectedCount = detectedTags.length;
  const totalTags = Object.keys(results).length;

  let score = 0;
  let warningCount = 0;

  if (detectedCount > 0) {
    let totalScore = 0;
    for (const tag of detectedTags) {
      if (tag.isDuplicate) {
        totalScore += 60;
        warningCount++;
      } else if (tag.isMultiContainer) {
        totalScore += 90;
      } else if (tag.status === 'missing_events') {
        totalScore += 50;
        warningCount++;
      } else if (tag.status === 'partial_events') {
        totalScore += 70;
        warningCount++;
      } else if (!tag.hasEventFire && PRESCRIPTIONS[Object.keys(results).find((k) => results[k] === tag)]?.no_event) {
        totalScore += 80;
        warningCount++;
      } else {
        totalScore += 100;
      }
    }
    score = Math.round(totalScore / detectedCount);
  }

  return {
    score,
    summary: { detectedCount, totalTags, errors: 0, warnings: warningCount },
    tags: results,
    hosting: detectHosting(htmlContent, networkRequests),
  };
}

// 단일 페이지 스캔 (pageType: home/product/cart/checkout/thankyou/custom)
export async function scanPage(targetUrl, pageType = 'custom') {
  const browser = await chromium.launch({ headless: true });
  try {
    const raw = await collectPageData(browser, targetUrl);
    const analysis = analyzePageData(raw, pageType);
    return {
      url: targetUrl,
      type: pageType,
      scannedAt: new Date().toISOString(),
      ...analysis,
    };
  } finally {
    await browser.close();
  }
}

// 여러 페이지 순차 스캔 (브라우저 공유)
export async function scanMultiplePages(pages) {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error('pages 배열이 비어 있습니다');
  }

  const browser = await chromium.launch({ headless: true });
  const pageReports = [];

  try {
    for (const p of pages) {
      const url = p.url;
      const pageType = p.type || 'custom';
      try {
        const raw = await collectPageData(browser, url);
        const analysis = analyzePageData(raw, pageType);
        pageReports.push({
          url,
          type: pageType,
          label: p.label || PAGE_TYPE_LABELS[pageType] || url,
          scannedAt: new Date().toISOString(),
          ...analysis,
        });
      } catch (err) {
        pageReports.push({
          url,
          type: pageType,
          label: p.label || PAGE_TYPE_LABELS[pageType] || url,
          scannedAt: new Date().toISOString(),
          error: err.message,
          score: 0,
          summary: { detectedCount: 0, totalTags: Object.keys(TRACKERS).length, errors: 1, warnings: 0 },
          tags: {},
          hosting: null,
        });
      }
    }
  } finally {
    await browser.close();
  }

  const validReports = pageReports.filter((p) => !p.error);
  const overallScore = validReports.length > 0
    ? Math.round(validReports.reduce((s, p) => s + p.score, 0) / validReports.length)
    : 0;

  // 호스팅: 첫 번째 유효 페이지에서
  const hosting = validReports[0]?.hosting || { id: 'general', name: '일반' };

  return {
    url: pages[0].url,
    scannedAt: new Date().toISOString(),
    hosting,
    overallScore,
    pageCount: pageReports.length,
    pages: pageReports,
  };
}

// 하위 호환: scanUrl → scanPage
export const scanUrl = scanPage;

// ─── CLI 진입점 (직접 실행 시에만 동작) ──────────────────────────────────────

const isCLI = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isCLI) {
  const url = process.argv[2];
  if (!url) {
    console.error('사용법: node scan.mjs <URL>');
    console.error('예시:   node scan.mjs https://www.cafe24.com');
    process.exit(1);
  }

  let targetUrl = url;
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  console.log(`\n🔍 TagDoctor 스캔 시작: ${targetUrl}\n`);
  try {
    const report = await scanUrl(targetUrl);

    // 콘솔 출력
    console.log('════════════════════════════════');
    console.log(`📋 TagDoctor 진단 리포트`);
    console.log(`🌐 ${report.url}`);
    console.log(`🏠 호스팅: ${report.hosting.name}`);
    console.log(`📅 ${report.scannedAt}`);
    console.log(`🟢 전체 점수: ${report.score}/100`);
    console.log(`   감지: ${report.summary.detectedCount}/${report.summary.totalTags} | 경고: ${report.summary.warnings}건`);
    console.log('════════════════════════════════');

    for (const [, r] of Object.entries(report.tags)) {
      const icon = !r.detected ? '⬜' : r.isDuplicate ? '⚠️ ' : r.isMultiContainer ? 'ℹ️ ' : '✅';
      console.log(`${icon} ${r.name} [${r.status}]${r.ids.length ? ' ID: ' + r.ids.join(', ') : ''}`);
    }

    // JSON 저장
    const filename = `report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    writeFileSync(filename, JSON.stringify(report, null, 2));
    console.log(`\n📁 리포트 저장됨: ${filename}`);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}
