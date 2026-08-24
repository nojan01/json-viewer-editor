#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

APP_NAME="JSON Viewer"
BUILD_DIR="src-tauri/target/release/bundle"
STAGING="$BUILD_DIR/dmg-staging"
VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"

case "$(uname -m)" in
    arm64) DMG_ARCH="aarch64" ;;
    x86_64) DMG_ARCH="x64" ;;
    *)
        echo "Unsupported macOS architecture: $(uname -m)" >&2
        exit 1
        ;;
esac

DMG_NAME="${APP_NAME}_${VERSION}_${DMG_ARCH}.dmg"

echo "=== Creating clean DMG v${VERSION} ==="

rm -rf "$STAGING"
mkdir -p "$STAGING"

# Preserve the stapled notarization ticket and all extended attributes.
ditto "$BUILD_DIR/macos/${APP_NAME}.app" "$STAGING/${APP_NAME}.app"

# Applications symlink for drag & drop
ln -s /Applications "$STAGING/Applications"

echo "Staging contents:"
ls -la "$STAGING/"

# Create DMG
rm -f "$BUILD_DIR/dmg/$DMG_NAME"
mkdir -p "$BUILD_DIR/dmg"

hdiutil create -volname "$APP_NAME" \
    -srcfolder "$STAGING" \
    -ov -format UDZO \
    "$BUILD_DIR/dmg/$DMG_NAME"

rm -rf "$STAGING"

echo ""
echo "=== DMG created: $BUILD_DIR/dmg/$DMG_NAME ==="
ls -la "$BUILD_DIR/dmg/$DMG_NAME"
