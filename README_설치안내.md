# PLANT MATTER FIELD — BETA 02 (Windows + iPhone)

이 프로젝트는 ZIP 압축을 풀고 GitHub Pages에 올리면 Safari에서 설치형 웹앱(PWA)으로 사용할 수 있는 버전입니다. Apple Developer 유료 계정, Mac, Expo Go, 별도의 Node.js 설치가 필요하지 않습니다. **단, GitHub에 게시하고 배포하는 계정 작업은 직접 수행해야 합니다.**

## 1. GitHub Pages에서 무료로 설치 주소 만들기

1. https://github.com/ 에서 로그인하고, 오른쪽 위 `+` → **New repository** 클릭
2. Repository name: `plant-matter-field` / Public 선택 → **Create repository**
3. 새 저장소의 **uploading an existing file**을 선택해 **압축을 푼 폴더의 내부 파일과 `assets` 폴더 자체**를 업로드합니다. ZIP 자체를 올리지 말고 `index.html`이 저장소 최상위에 있도록 배치합니다.
4. **Commit changes** 클릭
5. GitHub 저장소의 **Settings → Pages → Build and deployment → Source = Deploy from a branch**, Branch = `main`, Folder = `/(root)` → **Save**
6. Pages 화면에 표시되는 주소를 확인합니다. 주소는 보통 `https://아이디.github.io/plant-matter-field/` 형태입니다. 정확한 주소는 GitHub Pages 화면에서 확인해 주세요.

> `README_설치안내.md`와 소스코드가 공개 저장소에 게시됩니다. 실제 식물의 GPS 데이터 또는 개인 백업 JSON 파일은 절대 저장소에 올리지 마세요. 기록은 앱을 실행한 기기의 브라우저에만 저장됩니다.

## 2. 아이폰 홈 화면에 설치

1. 아이폰 **Safari**에서 위 Pages 주소를 엽니다.
2. **공유** → **홈 화면에 추가**를 누릅니다.
3. **웹앱으로 열기(Open as Web App)** 옵션이 보이면 켜고 **추가**합니다.
4. 홈 화면의 **PM FIELD** 아이콘을 눌러 실행합니다. 이후 앱 실행에 컴퓨터 연결이나 QR 코드는 필요 없습니다.
5. **사진 촬영**과 **현재 GPS 좌표 가져오기** 기능을 처음 사용할 때 해당 권한을 허용합니다.

## 3. 새 버전 업데이트

- `index.html`, `styles.css`, `app.js` 등을 수정해 GitHub 저장소의 `main` 브랜치에 올리면 GitHub Pages에 새 버전이 배포됩니다.
- 아이폰에서는 앱을 다시 열거나 새로고침하면 변경된 코드를 받을 수 있습니다. 캐시된 파일이 남으면 앱 종료 후 다시 열거나 웹사이트 데이터를 갱신하세요.
- **내가 이 채팅에서 코드를 수정한 것만으로 자동 배포되지는 않습니다.** GitHub에 소스코드를 반영할 권한 및 배포 절차가 필요합니다.
- 새 코드를 배포할 때 `sw.js`의 `CACHE_NAME`을 새 버전으로 변경하면 기존 캐시를 갱신하기 편합니다.

## 4. 현재 포함된 기능

- Equal Earth 면적 보존 도법 세계 지도, GPS 좌표는 WGS84 저장
- 식물 사진 / GPS / 고도 / 조도 / PPFD / 기온 / 습도 / 서식지 / 기질 / 표본 등 기록
- 학명·지역 검색, 동정 의견 이력(개인 기기 전용), 사진 EXIF 제거 후 이미지 저장
- GPS 공개/대략적 공개/비공개 선택(기본값 비공개)
- IndexedDB에 로컬 저장 / JSON 백업과 복원 / 설치 후 기본 화면 오프라인 열기
- 네 개의 **DEMO** 기록은 실제 식물 분포 데이터나 현장 측정값이 아님

## 5. 주의사항

- 지금은 **다중 사용자 공유, 온라인 계정, 서버 동기화, AI 학명 동정이 없습니다.** 인터넷을 통해 다른 이용자와 관찰 자료를 공유하는 기능은 서버 구축 후에만 가능합니다.
- **아이폰에 저장한 사진·기록은 그 기기 브라우저에만 저장**됩니다. Safari의 웹사이트 데이터 삭제, 저장 공간 압박, 사생활 보호 모드 등의 경우 기록이 없어질 수 있습니다. 정기적으로 **내 필드 → JSON 백업**을 내려받으세요.
- 백업 JSON은 원본 GPS 좌표를 포함할 수 있으며, 공개 GitHub 저장소나 채팅방 등에 올리지 마세요.
- 사진의 EXIF 제거는 브라우저 canvas로 JPEG 재인코딩하여 수행합니다. 원본 사진을 공유하는 것과는 다릅니다.
- PWA는 iOS 네이티브 센서에 대한 접근이 제한될 수 있으며, 조도는 수동 기록입니다.
- `file://`로 파일을 직접 열면 지도 JSON 로딩과 오프라인 설치가 제한됩니다. **GitHub Pages(HTTPS)**에서 테스트하세요.

## 6. 향후 개발

온라인 계정과 사용자 공유를 시작하려면 Supabase 같은 인증·데이터베이스·사진 저장소를 추가하고, Row Level Security(RLS)와 식물 서식지 GPS 보호 정책을 마련해야 합니다. 데이터는 Darwin Core와 매핑할 수 있도록 구조화해 확장합니다.
