#!/bin/bash

# Build, Developer-ID sign, notarize and staple the macOS release.
set -euo pipefail

cd "$(dirname "$0")"

APP_NAME="JSON Viewer"
BUILD_DIR="src-tauri/target/release/bundle"
APP_PATH="$BUILD_DIR/macos/${APP_NAME}.app"
VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
NOTARYTOOL_PROFILE="${NOTARYTOOL_PROFILE:-DesktopProfileManager}"

case "$(uname -m)" in
    arm64) DMG_ARCH="aarch64" ;;
    x86_64) DMG_ARCH="x64" ;;
    *)
        echo "Unsupported macOS architecture: $(uname -m)" >&2
        exit 1
        ;;
esac

DMG_PATH="$BUILD_DIR/dmg/${APP_NAME}_${VERSION}_${DMG_ARCH}.dmg"
APP_ARCHIVE="$BUILD_DIR/${APP_NAME}_${VERSION}_${DMG_ARCH}-notarization.zip"

if [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
    APPLE_SIGNING_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | \
        sed -n 's/.*"\(Developer ID Application:.*\)"/\1/p' | head -n 1)"
fi

if [ -z "$APPLE_SIGNING_IDENTITY" ]; then
    echo "No valid Developer ID Application identity found." >&2
    exit 1
fi

export APPLE_SIGNING_IDENTITY

echo "Building and signing ${APP_NAME} ${VERSION}..."
npm run build

echo "Verifying Developer ID signature..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
codesign -dv --verbose=4 "$APP_PATH" 2>&1 | grep -F "Authority=Developer ID Application:"

echo "Submitting app to Apple notarization service..."
rm -f "$APP_ARCHIVE"
ditto -c -k --keepParent "$APP_PATH" "$APP_ARCHIVE"
xcrun notarytool submit "$APP_ARCHIVE" \
    --keychain-profile "$NOTARYTOOL_PROFILE" \
    --wait

echo "Stapling and validating app ticket..."
xcrun stapler staple "$APP_PATH"
xcrun stapler validate "$APP_PATH"

echo "Rebuilding DMG with the stapled app..."
bash ./repackage-dmg.sh

echo "Signing DMG..."
codesign --force --sign "$APPLE_SIGNING_IDENTITY" --timestamp "$DMG_PATH"
codesign --verify --verbose=2 "$DMG_PATH"

echo "Submitting DMG to Apple notarization service..."
xcrun notarytool submit "$DMG_PATH" \
    --keychain-profile "$NOTARYTOOL_PROFILE" \
    --wait

echo "Stapling and validating DMG ticket..."
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"

echo "Running Gatekeeper assessments..."
spctl --assess --type execute --verbose=4 "$APP_PATH"
spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG_PATH"

rm -f "$APP_ARCHIVE"

echo "Release ready: $DMG_PATH"
