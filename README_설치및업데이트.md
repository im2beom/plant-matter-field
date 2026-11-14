# PLANT MATTER RAINFOREST MEMORIES — BETA 03

**Windows + iPhone / GitHub Pages 설치형 웹앱(PWA) 업데이트 패키지**

## 먼저 알아둘 점
- IPA 파일이 아닙니다. 아이폰 Safari에서 열어 홈 화면에 추가하는 PWA입니다.
- 실제 Google/이메일 계정 가입, 회원 탈퇴, 다른 이용자와의 공유에는 별도의 **Supabase 백엔드 연결 및 설정**이 필요합니다. 이 ZIP만 업로드하면 로그인은 활성화되지 않습니다.
- 지금 작성하는 식물 관찰 기록은 **기기의 IndexedDB에만 저장**됩니다. 로그인 기능을 연결해도 서버로 자동 이전되지 않습니다. 데이터 공유·클라우드 동기화는 다음 개발 단계입니다.
- 지도의 상세 타일은 인터넷 연결이 필요합니다. 이퀄 어스 세계 지도 자체는 정적 SVG 형태로 오프라인 캐시가 가능하지만, 확대 시 메르카토르 상세 지도 데이터는 온라인입니다.
- 모든 앱 UI 글자는 CSS `font-weight: 400`과 Pretendard Regular를 사용합니다. Pretendard는 CDN에서 불러오므로 오프라인 초기 실행 시 대체 글꼴로 보일 수 있습니다. 폰트 파일은 ZIP에 포함하지 않습니다.
- 로고는 사용자 제공 `PLANT_MATTER_LOGO.ai`의 그래픽을 그대로 래스터로 사용하며, 1:1 아이콘에는 여백만 추가했습니다. AI 원본은 공개 저장소에 넣지 않았습니다.

## 기존 GitHub Pages 업데이트 방법

기존 저장소: `https://github.com/im2beom/plant-matter-field`

1. **중요**: 기존 BETA 02에서 관찰 기록을 작성했다면 먼저 `PROFILE → JSON 내보내기`로 백업하세요. 앱 URL과 Safari 저장소를 유지하면 일반적으로 IndexedDB가 이어지지만, 브라우저 데이터 삭제 등으로 사라질 수 있습니다.
2. ZIP 파일을 Windows 컴퓨터에서 압축 해제합니다.
3. 압축 해제한 **BETA03 폴더 안의 파일과 `assets`, `supabase` 폴더를 포함한 모든 내용**을 확인합니다.
4. GitHub 저장소를 열고 **Add file → Upload files**를 선택합니다.
5. 압축 풀린 파일과 폴더를 업로드 영역으로 끌어다 놓습니다. `index.html`, `app.js`, `styles.css`, `config.js`, `manifest.webmanifest`, `sw.js`가 반드시 저장소 최상위(`/`)에 있어야 합니다. `assets` 폴더도 자체 하위 경로를 유지해야 합니다.
6. 같은 이름 파일의 교체 사항을 검토한 후 **Commit changes**를 누릅니다.
7. GitHub → **Actions**에서 Pages 배포가 초록색 체크로 끝난 뒤 `https://im2beom.github.io/plant-matter-field/`에 접속합니다.
8. 기존 아이폰 홈 화면의 앱 아이콘을 누르거나, Safari에서 배포된 URL을 열어 **공유 → 홈 화면에 추가**를 선택합니다.
9. 화면에 이전 버전이 남아 있으면 Safari에서 새로고침한 뒤 PWA를 완전히 종료하고 다시 엽니다. 캐시 업데이트가 한 번 더 필요할 수 있습니다.

> GitHub 업로드 화면에서 폴더가 한 번에 선택되지 않으면 Windows **파일 탐색기에서 폴더째 드래그**하세요. ZIP 자체를 저장소에 업로드하면 웹앱으로 실행되지 않습니다.

## 이번 버전에서 가능한 기능

- 6개 하단 탭: HOME / MAP / RECORD / EXPLORE / PROFILE / OPTIONS
- **두 지도 투영 방식**: 메르카토르(EPSG:3857) 상세 지도 / 이퀄 어스(EPSG:8857) 세계 지도, 확대 시 상세 지도 전환
- 지도 손가락 확대·이동, 관찰 핀, 선택 기록 열기 (상세 지도는 Leaflet 및 OpenStreetMap 온라인 타일 사용)
- 앱에서 관찰 식물 새 기록, 사진 촬영·선택, GPS 좌표, 환경값, 자생지, 현장 메모 입력
- **내 관찰 기록 언제든 수정/삭제**, 기록 ID 보존, 수정 시각 및 변경 필드 이력
- 개인 기록 아카이브, 검색, JSON 백업 내보내기/가져오기
- OPTIONS에서 지도 방식 변경 및 저장
- Supabase와 연결할 수 있도록 준비된 로그인 UI/프로필 공개 이메일 선택/탈퇴 UI (연결 전에는 안내만 표시됨)
- PLANT MATTER 원본 로고 PNG 및 1:1 앱 아이콘, Pretendard Regular(400)

## 아직 지원하지 않는 것

- 현재 사용자 계정 가입·로그인/계정 탈퇴 **실제 작동** (Supabase 설정 필요)
- 사용자 간 기록 실시간 공유, 공동 동정, 서버 저장, 여러 기기 동기화
- 컴퓨터의 파일 변경이 GitHub/서버로 **자동 업로드**되는 기능
- 오프라인 상세 지도 타일 저장, 위성사진, 실제 야생 식물 분포 검증

## 인증 기능 활성화 계획

1. [Supabase](https://supabase.com)에서 프로젝트 생성.
2. `supabase/schema.sql`의 테이블과 RLS 정책 적용.
3. **Authentication → Providers**에서 이메일, Google OAuth 설정. Google Cloud OAuth 설정 및 리디렉션 URL 등록 필요.
4. **Authentication → URL Configuration**의 Site URL과 Redirect URLs에 배포 주소 등록.
5. `config.js`의 `supabaseUrl`, `supabasePublishableKey`에 **공개 프로젝트 URL과 publishable/anon 키**만 넣습니다. `service_role` 키를 웹앱이나 GitHub 저장소에 넣으면 안 됩니다.
6. 진짜 계정 삭제를 사용하려면 관리자 권한으로 구동되는 보안된 Edge Function `delete-account`를 별도로 배포해야 합니다. 백엔드 보안 구성이 완료되기 전에는 회원 탈퇴가 완료됐다고 표시하지 않습니다.

## 데이터·개인정보 주의

- 민감 서식지 좌표는 기본 **비공개**로 설정되어 있습니다. 공개 수준을 선택하더라도 현재는 내 기기 지도에만 적용됩니다.
- 대략적 위치는 좌표를 1° 격자로 일반화하지만, 실제 희귀종 보호를 위해서는 서버 차원의 민감종 처리 정책이 추가로 필요합니다.
- JSON 백업에는 정확한 좌표 및 사진이 포함될 수 있으니 외부 공개를 피하세요.
- 지도에 나타나는 DEMO 관찰 기록과 계측치는 테스트용 가상 자료입니다.

## 프로젝트 파일 구조

```
index.html                   # 앱 진입점
app.js                       # 화면/지도/기록/계정 로직
styles.css                   # Pretendard 400 UI
config.js                    # Supabase 공개키 설정 (기본값 비워둠)
manifest.webmanifest         # iPhone 홈 화면 메타데이터
sw.js                        # 로컬 앱 파일 캐시
.nojekyll                    # GitHub Pages 정적 파일 보존
assets/
  icon-180.png
  icon-512.png
  icon-1024.png
  plant-matter-wordmark.png
  staurogyne-reference.jpg
  landPath.json
  managed/                   # 향후 외부 이미지 관리용 자리
supabase/schema.sql          # 선택적 인증 DB 설치용 SQL
```
