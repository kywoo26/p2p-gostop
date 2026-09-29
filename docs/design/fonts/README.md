# OFL 폰트 서브셋 파이프라인 (VD-04, plan §1.8)

**방향·폰트 미확정. 앱에 연결하지 않은 공통 도구.** 새 npm 의존성 없음. 원본 다운로드는 조사 단계만 허용하며 파이프라인 자체는 로컬 입력만 읽는다. [공식 FontTools subset API](https://fonttools.readthedocs.io/en/latest/subset/index.html), [공식 TTFont API](https://fonttools.readthedocs.io/en/latest/ttLib/ttFont.html)를 사용한다. Context7 `/fonttools/fonttools` 문서를 확인했다.

| 입력/출력 | 계약 |
|---|---|
| `sources.json` | OFL-1.1 후보 4종, 고정 URL·원본/라이선스 SHA-256. 채택한 1종만 앱에 포함 |
| `--corpus` | UTF-8 실제 UI 문자 집합. 끝 개행 제외, 숫자 0~9 항상 포함. 주석 포함 보수적 상한은 목업 조사에서만 사용 |
| `--family` | 원본/RFN과 다른 수정본 이름. 법적 RFN 목록 확인은 고지 검토에도 남김 |
| `--inputs` | 원본 바이너리·라이선스 파일. 해시/OFL 원문 불일치면 중단 |
| `--output` | `<family>.woff2`, `.css`, `.json`, `-OFL.txt`; CSS는 cmap 그대로 unicode-range, 로컬 상대 URL만 |
| 160 KiB gate | 실제 WOFF2 바이트 ≤163,840. **폰트 한 종 상한**; 앱 전체 ≤1.5 MiB는 기존 build:web가 별도 검사 |
| 글리프 gate | 원본·출력에 코퍼스 누락 0; 실패 시 파일을 쓰지 않음. 임의 사용자 이름은 시스템 fallback 허용 |
| 숫자 gate | 원본 `tnum` 있으면 출력도 존재, 0~9에 적용한 advance가 원본과 같고 등폭. `tnum` 없는 Noto는 기본 등폭 검사. 미지원 substitution lookup은 실패 |
| 가변 축 gate | 태그/최소/기본/최댓값 동일. 모든 weight·layout feature 보존, hinting 제거 |
| 고지 | 원문 byte 그대로 복사, name의 copyright/license 레코드 보존, 수정 family/PS 이름 교체. [배포 고지 템플릿](NOTICE.template.md) |

`unicode-range`만 선언해서 다운로드 크기를 줄였다고 보고하지 않는다. 실제 바이너리를 먼저 subset한다. 지금은 단일 파일/가족; 향후 분할 시 범위 중복·숫자 중복 다운로드도 검사해야 한다. 이번 gate의 advance는 폰트 기본 축 좌표이며 모든 weight/브라우저 shaping·래스터화의 완전한 검증은 아니다. 앱 적용 PR에서 400/500/700/800 weight와 Chromium/WebKit, 사람이 Galaxy/iPhone 실제 숫자 정렬을 확인한다.

## Docker 실행

[목업 재현 원본 표](../mockups/README.md)의 8파일을 `/tmp/visual-research`에 준비한다. 호스트에 FontTools를 설치하지 않는다. 다음 명령은 선택 예시이며 폰트 채택을 의미하지 않는다. 출력은 임시 디렉터리를 사용하고 성공한 산출물만 검토 후 배포 폴더로 옮긴다. 실패했을 때 이전 산출물을 성공 결과로 사용하지 않는다.

```sh
docker run --rm -v "$PWD:/work" -v /tmp/visual-research:/inputs:ro \
  python:3.12-slim@sha256:f77ac9e44ae96ef2c90b8053ea08c31f8be030f824196b0ae4db6d462c84e51f \
  sh -c 'pip install --quiet fonttools==4.61.1 brotli==1.2.0 && python /work/docs/design/fonts/subset_font.py --manifest /work/docs/design/fonts/sources.json --inputs /inputs --corpus /work/docs/design/mockups/fonts/corpus.txt --family VDPretendard --output /tmp/font-output && python /work/docs/design/fonts/test_subset.py'
```

5개 검사: 4후보 roundtrip/결정적 출력·고지 보존, 원본 hash 변조 거부, 미지원 문자 거부, 예산 초과 시 쓰기 금지, tnum 제거 결과 거부. 문구가 바뀌면 코퍼스를 다시 생성하고 이 gate와 브라우저 렌더를 함께 돌린다. 최종 앱의 UI 문자열 카탈로그·오류/재접속/정산/보조 문구를 코퍼스로 연결하는 작업은 구현 PR에 남아 있다.
