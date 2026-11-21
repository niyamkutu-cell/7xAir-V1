#!/usr/bin/env bash
set -euo pipefail

TARGETS=("1.21.11" "26.2")
BUNDLE_OUT="${SEVENXAIR_BUNDLE_DIR:-../../apps/launcher/src-tauri/resources/client-bundles}"
mkdir -p "$BUNDLE_OUT"

for target in "${TARGETS[@]}"; do
  echo "==> Building 7xAir Fabric Client for Minecraft ${target}"
  ./gradlew clean build -Pmc_target="$target"
  JAR_PATH=$(find build/libs -maxdepth 1 -name "7xair-client-${target}-*.jar" ! -name "*-sources.jar" | head -n 1)
  if [ -n "$JAR_PATH" ]; then
    cp "$JAR_PATH" "${BUNDLE_OUT}/7xair-client-${target}.jar"
    echo "Staged ${BUNDLE_OUT}/7xair-client-${target}.jar"
  fi
done
