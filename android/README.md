# Android 릴레이 검증

`./dev.sh android:test`는 `RelayScenarioTest`에서 `packages/relay-dev/test/relay-scenarios.json`의 RELAY-01~09를 각각 Ktor `testApplication`으로 실행한다. 테스트는 Gradle 작업 디렉터리에서 상위 디렉터리를 탐색해 저장소의 JSON 파일을 **실행 시 읽는다**. 테스트 리소스 복사본은 없다.

새 중계 규칙은 공유 JSON에 시나리오를 추가하면 Node와 Kotlin 테스트에 함께 적용된다. Android의 LAN 게이트 테스트에서는 원격 게스트를 허용하도록 LAN 모드를 켜고, 비루프백 호스트 역할 거절은 그대로 확인한다.
