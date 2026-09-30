# #208 현행 추적 파일 개인정보 잔존 감사

근거: AGENTS.md §1, spec NF-01·NF-RP-06, plan §1.8·§1.9. [감사 이슈 #208](https://github.com/kywoo26/p2p-gostop/issues/208)에 대한 부분 구현이며 과거 이력·외부 첨부까지 완료했다는 뜻이 아니다.

## 범위와 실제 수정

기준 `664a181e4ab006a450e11f2111134272ac0ad3ef`: Git 추적 988개, UTF-8 텍스트 695개, 바이너리 293개. 코드·주석·문서·fixture·스크립트·설정·워크플로 텍스트를 검사했다. 비밀/키/환경 파일과 symlink는 내용 대신 경로 유형만 보고하는 경계다. ignored·private 파일, 사용자 운영 중계, 프로세스, 별도 릴리스 체크아웃은 조사하지 않는다.

`android/app/src/main/kotlin/com/kywoo26/p2pgostop/net/IpSelector.kt`의 실기기 관측 주석 91·92·100행 주소 3곳을 대역 역할 예시로 일반화했다. 인터페이스 선택·CGNAT/VPN 감점·유예 설명과 실행 코드는 보존했다.

## 오탐과 보존 근거

- `packages/web/e2e/fonts.conf:17`: 특정 사용자명이 없는 모든 홈 디렉터리 거부 glob. 실제 경로 잔존으로 세지 않고 fontconfig 의미를 보존한다.
- 저장 복원 fixture의 game reveal 후보: 64자, 두 글자, 최소 반복 주기 2인 합성값. 고엔트로피/출처 불명 초기 판단은 오탐이었다. 임시 치환은 복구했고 원본·commit-reveal 복원 계약을 유지한다. 허용은 해당 경로·행·필드 포함 일치 문자열의 정확한 지문과 합성 근거에 한정한다.
- 테스트의 사설 주소·짧은 credential·반복 token은 고정 정상/반례 입력으로 생성한 합성 자료다. 파일 전체나 모든 반복형/secret 필드를 면제하지 않는다. 새 값·다른 파일·다른 위치는 다시 검토한다.
- SVG path 소수 좌표, Kotlin `return@` 라벨, npm/Actions 버전, JDK 패치 표기, Markdown 취소선은 해당 문법으로 구분한다. 공개 프로젝트 링크·공식 링크·Android 법적 패키지 식별자와 NOTICE 원저작자 라이선스 귀속은 보존한다.

## 동시 소유 및 공개 PR

main의 `tools/relay/README.md:3,43`·`tools/relay/relay.ps1:5,6` personal-path 4개는 #190 소유다. 게시된 [PR #190](https://github.com/kywoo26/p2p-gostop/pull/190) `9de79c24cbd60cbb4941acb2d48bd57a75c42bf4`에서는 해소를 확인했다. 해당 파일을 중복 수정하지 않는다. 신규 `check-native.ps1` tailnet 후보 4개는 담당자가 직접 만든 JSON/인수의 합성 정상·반례로 확인했다. 최종 게시 HEAD는 다시 검사한다.

열린 [PR #203](https://github.com/kywoo26/p2p-gostop/pull/203) `9bf51d817e0f579124f250f9877a38bbc6ee5370` 및 #190의 추가 행·본문·review·review comment·discussion을 값 없이 검사했다. 본문·댓글에는 초기 패턴 finding이 없었다. PR head 이후 변경은 재검사 대상이다. 타인 댓글을 강제 편집하거나 편집했다고 주장하지 않는다. playback/anim, 시인성 소유 UI, 신규 UX 연구 및 이슈 정리 소유 범위는 수정하지 않았다.

## 재유입 검사와 한계

`npm run privacy:check`는 Git 추적 텍스트 전체와 추가 행만 검사하며 결과는 위치·유형·개수뿐이다. 허용 목록은 확인한 합성/귀속/문법의 정확한 지문을 파일·행·필드에 묶는다. 실제 비밀 후보의 지문을 공개 자료로 생성하지 않는다. #190 기존 잔존은 위치 4개만 별도 pending으로 표시하고 추가 행 검사에는 허용하지 않는다. #190 병합 후 이 pending 목록을 제거한다.

`npm run lint`에 합성 자료 기반 검출기 테스트와 같은 검사를 연결하므로 기존 CI·verify에도 적용된다. 빌드 산출물·제품 코드에 검출기를 넣거나 신규 런타임/유료 의존성을 추가하지 않는다. PR 검토에서는 본문·댓글을 별도로 읽되 원문을 터미널/보고/CI artifact에 출력하지 않고 담당자에게 경로·유형·수위만 전달한다.

패턴 검사로 미등록 hostname·단독 계정명·인코딩/분할된 임의 secret을 완전히 증명할 수 없다. 바이너리·과거 커밋·첨부·외부 노출·ignored/private 내용은 미검증이다. 실제 운영 secret 발견 시 내용 없이 root에 알리고 이력 재작성·키 회전·운영 중단을 자동 실행하지 않는다. 이번 PR 하나의 병합으로 #208을 종료하지 않는다.

## 검증 상태

초기 `nvm use`·`npm ci` 성공. 최종 lint·check·단위/브라우저 테스트·웹 build·E2E smoke·Android 및 독립 리뷰/CI 결과는 최종 HEAD에서 기록한다. 실기기 시험 결과는 만들지 않는다.
