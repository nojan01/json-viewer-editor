#!/bin/bash
set -e

cd "$(dirname "$0")"

APP_NAME="JSON Viewer"
BUILD_DIR="src-tauri/target/release/bundle"
STAGING="$BUILD_DIR/dmg-staging"
VERSION="1.2.0"
DMG_NAME="${APP_NAME}_${VERSION}_aarch64.dmg"

echo "=== Creating clean DMG v${VERSION} ==="

rm -rf "$STAGING"
mkdir -p "$STAGING"

# Copy the built app
cp -R "$BUILD_DIR/macos/${APP_NAME}.app" "$STAGING/"

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
