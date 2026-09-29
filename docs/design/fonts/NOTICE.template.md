# 번들 폰트 고지 — 채택 시 작성

이 템플릿은 라이선스 원문을 대체하지 않는다. `<...>`가 남은 상태로 앱에 배포하지 않는다.

| 항목 | 값 |
|---|---|
| 원본 폰트 / 버전·커밋 | <이름 / 고정 버전> |
| 원 저작권자 | <원본 OFL의 copyright 전체 그대로> |
| 원본 / 고지 URL | <sources.json의 두 URL> |
| 원본 / 고지 SHA-256 | <sources.json의 두 해시> |
| 수정본 표시명 | <Reserved Font Name과 다른 family> |
| 수정 내용 | 실제 UI 문자 subset, WOFF2, 모든 가변 축·OpenType 기능 보존, hinting 제거, 표시명 변경 |
| 제작 도구 | FontTools 4.61.1 / Brotli 1.2.0, `uv run`(PEP 723 고정 의존성) |
| 코퍼스 / 산출물 SHA-256 | <파이프라인 JSON> |
| 파일 크기 / 상한 | <bytes> / 163,840 B |
| 라이선스 | SIL Open Font License 1.1 — 수정본에도 동일 적용 |
| 동봉 원문 | <family-OFL.txt, copyright·Reserved Font Name 포함 원문 전체> |

앱 설정 → 오픈소스 고지에서 저작권자와 로컬 OFL 원문을 읽을 수 있게 한다. 외부 URL은 출처 텍스트이며 폰트 로딩에 사용하지 않는다. 카드 고지와 폰트 고지는 각 자산의 라이선스를 따로 유지한다.
