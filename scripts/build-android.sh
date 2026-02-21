#!/usr/bin/env bash
# Build Android APK: build frontend, sync Capacitor, assemble.
# Usage: ./scripts/build-android.sh [--release]
#   --release  Build release APK (requires keystore.properties)

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE=false

for arg in "$@"; do
  if [[ "$arg" == "--release" ]]; then
    RELEASE=true
    break
  fi
done

cd "$ROOT"

echo "=== [1/3] Building frontend ==="
# Pass VITE_API_BASE for default server URL in APK (optional; user can configure at runtime)
(cd "$ROOT/frontend" && npm run build)

echo ""
echo "=== [2/3] Copying to mobile/www ==="
rm -rf "$ROOT/mobile/www/"*
cp -r "$ROOT/frontend/dist/"* "$ROOT/mobile/www/"

echo ""
echo "=== [3/3] Building Android APK ==="
cd "$ROOT/mobile"
npm run cap:sync
cd android
./gradlew clean

if $RELEASE; then
  if [[ ! -f keystore.properties ]]; then
    echo "Release build requires keystore.properties. See keystore.properties.example" >&2
    exit 1
  fi
  ./gradlew assembleRelease
  echo ""
  echo "Done. APK: $ROOT/mobile/android/app/build/outputs/apk/release/app-release.apk"
else
  ./gradlew assembleDebug
  echo ""
  echo "Done. APK: $ROOT/mobile/android/app/build/outputs/apk/debug/app-debug.apk"
fi
