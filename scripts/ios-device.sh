#!/bin/sh
# Build the web app, wrap it in the iOS shell and install + launch it on a connected iPad.
#   npm run ios:device                 → first paired iPad
#   DEVICE=<CoreDevice id> npm run ios:device
set -e
cd "$(dirname "$0")/.."
npm run build
npx cap sync ios
DEVICE=${DEVICE:-$(xcrun devicectl list devices 2>/dev/null | awk '/iPad/ && /available/ {for (i=1;i<=NF;i++) if ($i ~ /^[0-9A-F-]{36}$/ || $i ~ /^[0-9A-F]{8}-[0-9A-F]{16}$/) {print $i; exit}}')}
[ -n "$DEVICE" ] || { echo "ไม่พบ iPad ที่เชื่อมต่อ (ต่อสายหรือ Wi-Fi เดียวกัน และเปิด Developer Mode)"; exit 1; }
UDID=$(xcrun devicectl device info details --device "$DEVICE" 2>/dev/null | awk -F': ' '/udid/ {print $2; exit}')
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination "id=${UDID:-$DEVICE}" -derivedDataPath ios/build -allowProvisioningUpdates -quiet build
xcrun devicectl device install app --device "$DEVICE" ios/build/Build/Products/Release-iphoneos/App.app
xcrun devicectl device process launch --device "$DEVICE" ai.thaiwell.backoffice
echo "ติดตั้ง ThaiWell บน iPad แล้ว"
