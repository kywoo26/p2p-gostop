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

`npm run privacy:check`는 Git 추적 텍스트 전체와 추가 행만 검사하며 결과는 위치·유형·개수뿐이다. 허용 목록은 확인한 합성/귀속/문법의 정확한 지문을 파일·행·필드에 묶는다. 실제 비밀 후보의 지문을 공개 자료로 생성하지 않는다. #190 기존 잔존은 기준 SHA의 동일 blob·위치 4개만 별도 pending으로 표시하고 추가 행 검사에는 허용하지 않는다. 같은 행에서 값이 바뀌거나 다른 내용이 추가되어도 보류에서 제외되어 검출한다. #190 병합 후 이 pending 목록을 제거한다.

`npm run lint`에 합성 자료 기반 검출기 테스트와 같은 검사를 연결하므로 기존 CI·verify에도 적용된다. 빌드 산출물·제품 코드에 검출기를 넣거나 신규 런타임/유료 의존성을 추가하지 않는다. PR 검토에서는 본문·댓글을 별도로 읽되 원문을 터미널/보고/CI artifact에 출력하지 않고 담당자에게 경로·유형·수위만 전달한다. 허용 행의 이동은 면제를 잃으므로 명시적 재검토가 필요한 거짓 양성이고, 새 행을 조용히 면제하는 거짓 음성이 아니다.

패턴 검사로 미등록 hostname·단독 계정명·인코딩/분할된 임의 secret을 완전히 증명할 수 없다. 바이너리·과거 커밋·첨부·외부 노출·ignored/private 내용은 미검증이다. 실제 운영 secret 발견 시 내용 없이 root에 알리고 이력 재작성·키 회전·운영 중단을 자동 실행하지 않는다. 이번 PR 하나의 병합으로 #208을 종료하지 않는다.

## 검증 상태

`nvm use`·`npm ci`, lint(합성 검사기 8개 포함), check, 단위 테스트 563개, 브라우저 테스트 738개, 웹 build, E2E smoke 382개, Android assembleDebug/testDebugUnitTest/lint(`--max-workers=4`)가 성공했다. E2E는 `PLAYWRIGHT_PORT=4232`, 설정 기본 4 workers 이하로 한 번 실행했고 full 반복은 하지 않았다. 검사기 최종 수정은 lint·check와 표적 테스트로 검증하며 제품 실행 코드가 바뀌지 않아 제품 전체 검증을 반복하지 않는다. 독립 리뷰·최종 SHA CI는 별도 대기다. 실기기 시험 결과는 만들지 않는다.

재검사 시 열린 PR은 #190·#203·#213·#214이며 #203 게시 head는 `9548dd9d89888ed83be7cd68ec462121d55cb8c0`, #214는 `463d686b86ee28469d0445a24c96842a002b1df3`이다. 텍스트 추가 행·본문·댓글의 남은 패턴 후보는 #190 확인된 합성 tailnet 4개뿐이다. #214 이미지 patch 82개는 내용 미검증으로 별도 집계하며 finding 0이라고 표현하지 않는다.

CI의 첫 검사기 HEAD는 합성 임시 저장소가 `GITHUB_BASE_REF=main`을 상속하여 존재하지 않는 origin/main 비교에서 실패했다. 같은 환경변수로 로컬 재현 후 임시 저장소에만 `--base HEAD`를 명시했다. 실제 PR origin/main 비교 및 기준 blob pending 계약은 변경하지 않았다. 자동 rerun 대신 표적 환경 재검증과 새 SHA CI로 확인한다.

#190 최종 게시 `4a4384d75b629a948cecd3d949307ff2d9630755`의 변경 텍스트를 읽기 전용으로 재검사했다. README/relay의 main 잔존 4곳 해소를 재확인했고, check-native 합성 tailnet 4곳과 새 check-ownership 합성 6곳은 담당자 주석·고정 JSON/로컬 소유권 반례 근거로 정확 경로·행·일치 지문만 추가 허용했다. PR 본문/댓글 재검사와 #190 통합 후 pending 4곳 제거는 별도 확인한다. 소유 파일 직접 편집·운영 접근은 없다.

독립 리뷰 P2 후속 (#208 범위): wildcard 자체로 개인/worktree 경로를 면제하지 않는다. 기존 fonts.conf의 정확한 홈 glob 태그만 보존한다. SVG 좌표 면제는 .svg 문서의 실제 path d 속성·명령/인수/숫자 문법에 한정하고 일반 설명·URL·다른 속성·주석을 면제하지 않는다. creation-secret 표준 파일명은 내용/metadata 파일 접근 전에 제한한다. 합성 반례 선행 실패를 확인한 뒤 표적 테스트 9개로 검증했다. 정확 지문 허용의 변경은 검사기 정상 glob 비교 리터럴과 새 합성 반례·행 이동에 필요한 위치 정합뿐이다.

상대 home/Users 경로 형식은 현재 자동검사 미지원이며 수동 검토 대상이다. 미검출을 안전 판정으로 간주하지 않는다. 여러 줄 SVG의 개별 추가 행처럼 전체 문서 문맥을 입증할 수 없는 입력은 좌표로 자동 면제하지 않는다. 지원 범위를 확대하거나 실제 secret 파일을 열어 테스트하지 않는다.

SVG 좌표 구분 근거: [W3C SVG2 path 문법](https://www.w3.org/TR/SVG2/paths.html#PathDataBNF). 면제는 보수적인 명령·수치·인수 검증이며 전체 SVG 파서/일반 XML 면제가 아니다. 이 문법으로 입증하지 못한 입력은 새 후보로 검토한다. 기존 SVG 자산은 수정하지 않았다.

#190 실제 병합 후속: main `8ad63483aff38e7d6f3c34e8ffc5c257139204c0`을 충돌 없는 merge commit으로 통합했다. 위 pending·병합 대기 문구는 당시 상태다. 현재 허용 목록에서 pending 위치 4곳을 제거했고, 통합 파일의 합성 tailnet 10곳은 기존 정확 경로·행·지문에 모두 일치한다. #190 소유 파일이나 예외 범위를 추가 수정하지 않았다. 최종 통합 HEAD의 CI와 같은 리뷰어의 P2·통합 diff 재검토는 별도 조건이며 #208 전체 완료가 아니다.
