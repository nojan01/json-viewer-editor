const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const env = {...process.env};
const localKey = path.join(root,'.updater/json-viewer.key');
if (!env.TAURI_SIGNING_PRIVATE_KEY && fs.existsSync(localKey)) {
    env.TAURI_SIGNING_PRIVATE_KEY = localKey;
    env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= '';
}
const args = process.argv.slice(2);
const result = spawnSync(process.execPath,[require.resolve('@tauri-apps/cli/tauri.js'),'build',...args],{cwd:root,env,stdio:'inherit'});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
