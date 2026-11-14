# RAINFOREST MEMORIES BY PLANT MATTER — BETA 05

## 이번 변경

- 공식 상단 표기: `RAINFOREST MEMORIES` **가장 크게** → 아래 `BY` **작게** + 변형 없는 기존 `PLANT MATTER` 원본 워드마크 이미지.
- 기존 Pretendard Regular(400) 및 5개 하단 탭, 지도·탐사·관찰 기록 기능 유지.
- Google OAuth 오류·지연에 대비한 시간 제한, 오류 메시지, 재시도 UI 추가.
- Google 로그인/이메일 로그인 뒤 첫 가입 기본 정보 설정: 표시 이름, 로그인 이메일 확인, 전화번호(선택), 이메일 공개 여부, 전화번호 공개 여부.
- 필수: 서비스 이용약관과 개인정보 처리 안내 확인. **별도 선택 동의**: 업로드 이미지의 광고·홍보 사용 (기본 거부). 선택 동의 거절은 앱 이용을 제한하지 않음.
- Supabase에서 `permission denied for table profiles` 혹은 `is_beta_member` 오류가 발생할 때 사용할 권한 복구 SQL.

## 반드시 먼저 할 일 (관찰 기록 보존)

1. BETA 04 앱에서 개인 관찰 데이터를 **JSON 백업**하기. JSON에는 비공개 GPS와 탐사 경로가 들어가니 외부로 공유하지 마세요.
2. `https://github.com/im2beom/plant-matter-field`의 기존 `config.js`는 **삭제하거나 덮어쓰지 마세요.** 이미 설정한 Supabase Project URL/Publishable key를 유지해야 합니다.
3. ZIP 파일을 풀어서 **파일과 폴더를 그대로** GitHub `main` 저장소의 최상위에 업로드하고 **Commit changes**를 누르세요. 이 업데이트 ZIP에는 기존 `config.js`를 일부러 넣지 않았습니다.
4. GitHub Actions에서 Pages 배포가 초록색 체크인지 확인하고 `https://im2beom.github.io/plant-matter-field/`로 접속하세요.
5. 아이폰 홈 화면 앱이 옛 화면을 보이면 앱을 완전히 종료하고 재실행하거나 Safari에서 새로고침하세요. **웹사이트 데이터 삭제는 관찰 기록을 잃을 수 있으니 마지막 수단**으로만 사용하세요.

## Supabase 데이터베이스 업데이트 (실제 로그인·저장에 필수)

1. Supabase Dashboard → PLANT MATTER 프로젝트 → **SQL Editor**.
2. 이전 BETA04의 `supabase/schema_online_beta04.sql`을 정상적으로 실행했는지 먼저 확인합니다. 테이블이 전혀 만들어지지 않았다면 BETA04 SQL부터 성공적으로 적용해야 합니다. 이미 적용했으면 다시 실행할 필요 없습니다.
3. 이번 ZIP에 포함된 `supabase/beta05_auth_repair.sql` 내용을 새 SQL 쿼리로 복사하고 `Run`을 눌러 주세요.
4. `Success`를 확인하고 **Table Editor**에서 `profiles`, `profile_private_settings`, `beta_invites`가 있는지 확인하세요.
5. Google 로그인 계정이 베타 초대 목록에 없으면 아래 SQL로 등록하세요(이메일은 실제 주소로 교체).

```sql
insert into public.beta_invites (email)
values ('tester@gmail.com')
on conflict (email) do nothing;
```

6. Google Cloud의 OAuth Redirect URI와 Supabase `Authentication → URL Configuration`이 GitHub Pages 앱과 일치하는지 확인하세요.

> **주의**: SQL은 실제 온라인 DB를 변경합니다. 자동 실행되지 않았으므로 Supabase에서 본인이 직접 실행해야 합니다. 서버 함수 `delete-account`는 별도 배포 전까지 작동하지 않습니다.

## 로그인 및 기본 정보 화면 확인

1. 아이폰에서 앱 열기 → OPTIONS → Google 계정으로 계속하기.
2. Google 인증 후 OPTIONS에서 `WELCOME / FIRST TIME SETUP` 표시 확인.
3. 이름, 전화번호(선택), 이메일/전화번호 공개 여부 설정.
4. 두 필수 약관을 확인한 뒤 체크. 광고 사진 사용 선택 동의는 원하지 않으면 그대로 체크하지 않습니다.
5. **설정 완료하고 시작하기** → 프로필이 저장되면 앱으로 돌아갑니다.
6. 로그아웃 후 같은 Google 계정으로 로그인하면 첫 설정 화면이 반복되지 않아야 합니다. OPTIONS에서 언제든 공개 설정을 바꿀 수 있습니다.
7. 네트워크 오류나 OAuth 취소 후 OPTIONS에서 오류 안내와 다시 시도 버튼이 보이는지 확인합니다.

## 알아두기

- **약관과 개인정보 안내 HTML은 베타용 초안**입니다. 실제 지인에게 공개 테스트를 제공하기 전에 운영자 연락처, 개인정보 보유기간, 수탁·국외이전, 콘텐츠 사용 허가 범위 등 법률 내용을 검토·완성해 주세요.
- 사진의 광고 활용은 구체적인 매체·기간·철회 절차를 정해 별도 동의로 운영해야 합니다. 사진 저작권은 원저작자에게 있으며, 동의 이전 업로드 자료를 자동으로 광고에 사용해서는 안 됩니다.
- 프로필의 전화번호 원본과 동의 이력은 `profile_private_settings`로 분리하고, 공개에 동의한 값만 `profiles.public_phone`에 복사합니다. 기존 회원은 업데이트 후 최초 1회 기본 정보 확인을 진행합니다.
- 기존 관찰 기록은 같은 브라우저의 IndexedDB에 남습니다. GitHub 소스파일 교체만으로 개인 기록을 지우지 않습니다.
- 코드 문법 및 계정 설정 화면 생성 검사는 수행했습니다. **실제 Supabase 로그인, 아이폰 Safari/PWA, SQL 적용 테스트는 아직 수행하지 못했습니다.**
- `BETA05` 패키지는 이미지·관찰 기록을 삭제하지 않습니다. `config.js`는 본인의 기존 GitHub 파일을 계속 사용합니다.
