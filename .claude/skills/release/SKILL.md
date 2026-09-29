---
name: release
description: main의 CI 통과 커밋에 v 태그를 붙여 서명 APK 릴리스(release.yml)를 내보낸다. 태그 이름을 인자로 받는다(예 v0.2.0, v0.2.0-alpha).
argument-hint: <tag, 예 v0.2.0-alpha>
disable-model-invocation: true
allowed-tools: Bash(git fetch *) Bash(git status *) Bash(git rev-parse *) Bash(git describe *) Bash(git log *) Bash(gh run list *) Bash(gh run view *) Bash(gh release view *)
---

태그 `$ARGUMENTS` 로 릴리스한다. `.github/workflows/release.yml`이 태그 푸시를 받아 서명 APK를 GitHub Releases에 올린다. 워크플로가 아래 1·2를 다시 검사하지만, 실패한 태그를 남기지 않도록 푸시 전에 여기서 먼저 확인한다.

1. 대상 커밋: `git fetch origin --tags` 후 `git rev-parse origin/main`. 태그는 `origin/main` 이력 위의 커밋에만 붙인다. 로컬 main이 뒤처지거나 미커밋 변경이 있으면 멈추고 보고한다.
2. CI 게이트: `gh run list --workflow ci --commit <sha> --json status,conclusion,url`. 최신 실행이 `completed`·`success`가 아니면 멈춘다(진행 중이면 끝날 때까지 기다린 뒤 다시 본다). 우회(`workflow_dispatch`의 `force`)는 사용자 명시 지시가 있을 때만, 근거를 릴리스 노트에 남긴다.
3. 이름: SemVer `vX.Y.Z` 또는 `vX.Y.Z-<pre>`. `-`가 들어가면 워크플로가 prerelease로 표시한다. `git describe --tags --abbrev=0`로 직전 태그와 비교해 순서가 맞는지 본다. 이미 있는 태그면 멈춘다.
4. 실기기 절차서: 현재 절차 정본은 `docs/device-test/procedure.md`다(기존 릴리스 노트의 구경로는 당시 태그 이력 참조). 이번 빌드의 대상 버전·알려진 제한이 그 문서와 다르면 먼저 문서 PR을 병합하고 1부터 다시 한다.
5. 태그와 푸시(사용자 확인 필요, 프로젝트 권한 설정이 푸시에서 묻는다): `git tag -a $ARGUMENTS <sha> -m "<한 줄 요약>"` → `git push origin $ARGUMENTS`.
6. 확인: `gh run list --workflow release --limit 1`로 실행을 찾아 끝날 때까지 본다. 성공하면 `gh release view $ARGUMENTS`로 APK·`.sha256` 두 자산과 prerelease 여부를 확인한다. 실패하면 로그의 `::error::` 줄을 인용해 보고하고, 태그를 지우거나 다시 붙이지 않는다(사용자 결정).

보고: 태그, 커밋 SHA, CI 실행 URL, release 실행 URL, 릴리스 URL, 자산 이름.
