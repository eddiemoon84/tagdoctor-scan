// 진단 결과별 처방 (Render에서 DB에 직접 쓰기 위해 Vercel constants.ts에서 포팅)
// not_installed / not_installed_sdk_only / duplicate / multi_container / no_event 키만 사용
export const PRESCRIPTIONS = {
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
