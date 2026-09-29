# p2p-gostop 개발·CI 단일 이미지 (plan.md 2장). 로컬(compose.yaml), Dev Container, CI가 모두 이 이미지를 쓴다.
#   Node 24 + Playwright 브라우저(베이스 이미지) + Temurin JDK 21 + Android SDK(platform 36, build-tools, platform-tools).
# 버전은 AGENTS.md 2장 표를 따른다. 베이스 태그는 npm의 @playwright/test 버전과 반드시 같아야 한다.
# USER를 두지 않는다: compose·devcontainer가 uid 1000(dev)으로 실행하고, GitHub Actions는 root로 실행한다.

FROM eclipse-temurin:21.0.12.1_1-jdk-noble AS jdk
# jmods(83MB)는 jlink용이라 빌드에 필요 없다.
RUN rm -rf /opt/java/openjdk/jmods

FROM mcr.microsoft.com/playwright:v1.63.0-noble

# Android SDK 명령줄 도구: https://dl.google.com/android/repository/repository2-3.xml 의 cmdline-tools;23.0
# (SHA-1 e025545c…는 저장소 XML과 일치 확인, 아래는 같은 파일의 SHA-256)
ARG ANDROID_CMDLINE_TOOLS_BUILD=16111833
ARG ANDROID_CMDLINE_TOOLS_SHA256=0877a1d048fe4a24efe2eff536ca4223f7adeb58648bb81909d33c446918cfa8
# compileSdk/targetSdk 36(37 금지), build-tools는 AGP 9.4.1 기본값.
# 2026-09-29 이미지 빌드 실측: platform-tools 37.0.1, platforms;android-36 revision 2, build-tools 36.0.0.
# platform-tools는 sdkmanager의 최신 개정을 설치하므로 이미지 재빌드 때 source.properties의 개정을 확인한다.
ARG ANDROID_PACKAGES="platforms;android-36 build-tools;36.0.0 platform-tools"

ENV JAVA_HOME=/opt/java/openjdk \
    ANDROID_HOME=/opt/android-sdk \
    TZ=Asia/Seoul
ENV PATH=${JAVA_HOME}/bin:${ANDROID_HOME}/platform-tools:${PATH}

# Temurin 공식 권장 방식: 다른 베이스 이미지에는 JDK 디렉터리를 복사한다(hub.docker.com/_/eclipse-temurin).
COPY --from=jdk /opt/java/openjdk /opt/java/openjdk

# unzip: SDK 압축 해제용. sdkmanager는 설치에만 쓰고 지운다(약 200MB 절약, AGP는 sdkmanager 없이 SDK를 읽는다).
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends unzip; \
    rm -rf /var/lib/apt/lists/*; \
    cd /tmp; \
    curl -fsSLo tools.zip "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_CMDLINE_TOOLS_BUILD}_latest.zip"; \
    echo "${ANDROID_CMDLINE_TOOLS_SHA256}  tools.zip" | sha256sum -c -; \
    unzip -q tools.zip -d /tmp/cmdline; \
    rm tools.zip; \
    yes | /tmp/cmdline/cmdline-tools/bin/sdkmanager --sdk_root="${ANDROID_HOME}" --licenses > /dev/null; \
    /tmp/cmdline/cmdline-tools/bin/sdkmanager --sdk_root="${ANDROID_HOME}" --install ${ANDROID_PACKAGES} > /dev/null; \
    rm -rf /tmp/cmdline /root/.android /root/.temp; \
    ls "${ANDROID_HOME}" "${ANDROID_HOME}/build-tools" "${ANDROID_HOME}/platforms"

# 베이스의 ubuntu(uid/gid 1000)를 dev로 바꾼다. 호스트 WSL 사용자(uid 1000)와 같아 바인드 마운트 소유자가 유지된다.
# 캐시 폴더를 미리 만들어 두면 명명된 볼륨이 처음 붙을 때 dev 소유로 초기화된다.
# safe.directory: CI는 root로 실행하는데 체크아웃 소유자는 러너 사용자라 git이 저장소를 거부한다(Gradle versionName이 git describe를 쓴다).
RUN set -eux; \
    groupmod -n dev ubuntu; \
    usermod -l dev -d /home/dev -m -c dev ubuntu; \
    install -d -o dev -g dev /work /home/dev/.gradle /home/dev/.npm /home/dev/.android; \
    install -d -m 700 -o dev -g dev /home/dev/.claude; \
    git config --system --add safe.directory /work

COPY --chmod=755 dev-entrypoint.sh /usr/local/bin/dev-entrypoint
ENTRYPOINT ["/usr/local/bin/dev-entrypoint"]
WORKDIR /work
