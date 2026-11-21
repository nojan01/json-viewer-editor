#!/bin/bash
# Install the signed Apple Silicon application from the latest GitHub release.
set -euo pipefail
[[ $(uname -s) == Darwin && $(sysctl -n hw.optional.arm64) == 1 ]] || {
    echo "Dieses Release benötigt einen Mac mit Apple Silicon." >&2
    exit 1
}
repo=https://github.com/nojan01/json-viewer-editor
temp=$(mktemp -d)
mountpoint="$temp/mount"
stage=$(mktemp -d "/Applications/.json-viewer-install.XXXXXXXX")
target="/Applications/JSON Viewer.app"
cleanup() {
    if [[ -e "$stage/previous.app" && ! -e "$target" ]]; then
        mv "$stage/previous.app" "$target" || return
    fi
    if mount | grep -Fq " on $mountpoint "; then hdiutil detach "$mountpoint" -quiet || return; fi
    rm -rf "$temp" "$stage"
}
trap cleanup EXIT
trap 'exit 1' INT TERM HUP
curl --proto '=https' --proto-redir '=https' -fsSL \
    https://api.github.com/repos/nojan01/json-viewer-editor/releases/latest -o "$temp/release.json"
# Read only the known asset name and its GitHub-provided SHA-256 digest.
asset=$(osascript -l JavaScript - "$temp/release.json" <<'JXA'
function run(args) {
    ObjC.import('Foundation');
    const text = $.NSString.stringWithContentsOfFileEncodingError(args[0], $.NSUTF8StringEncoding, null);
    const release = JSON.parse(ObjC.unwrap(text));
    if (!/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(release.tag_name)) throw Error('Ungültiger Release-Tag');
    const version = release.tag_name.slice(1);
    const name = 'JSON.Viewer_' + version + '_aarch64.dmg';
    const asset = release.assets.find(item => item.name === name);
    if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)) throw Error('DMG oder Prüfsumme fehlt');
    return [release.tag_name, name, asset.digest.slice(7)].join(' ');
}
JXA
)
read -r tag name digest <<< "$asset"
curl --proto '=https' --proto-redir '=https' -fsSL "$repo/releases/download/$tag/$name" -o "$temp/release.dmg"
actual=$(shasum -a 256 "$temp/release.dmg")
[[ ${actual%% *} == "$digest" ]] || { echo "DMG-Prüfsumme stimmt nicht." >&2; exit 1; }
mkdir "$mountpoint"
hdiutil attach "$temp/release.dmg" -readonly -mountpoint "$mountpoint" -nobrowse -quiet
ditto "$mountpoint/JSON Viewer.app" "$stage/new.app"
codesign --verify --strict --deep "$stage/new.app"
spctl --assess --type execute "$stage/new.app"
plist="$stage/new.app/Contents/Info.plist"
[[ $(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist") == com.jsonviewer.editor ]]
[[ $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist") == "${tag#v}" ]]
if [[ -e "$target" ]]; then
    installed=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$target/Contents/Info.plist")
    pkgutil --compare-versions "${tag#v}" GE "$installed" || { echo "Eine neuere Version ist installiert." >&2; exit 1; }
    mv "$target" "$stage/previous.app"
fi
mv "$stage/new.app" "$target"
echo "JSON Viewer $tag wurde installiert."
