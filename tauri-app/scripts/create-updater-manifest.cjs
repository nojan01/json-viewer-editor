const fs = require('node:fs');
const path = require('node:path');

function createManifest(version, entries, notes = `JSON Viewer ${version}`) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A stable semantic version is required');
    const platforms = Object.create(null), assetNames = new Set();
    for (const [platform, artifact] of entries) {
        if (!/^(darwin|windows|linux)-(aarch64|x86_64)$/.test(platform)) throw new Error(`Unsupported platform: ${platform}`);
        if (platforms[platform]) throw new Error(`Duplicate platform: ${platform}`);
        const expectedExtension = platform.startsWith('darwin-') ? '.app.tar.gz' : platform.startsWith('windows-') ? '.exe' : '.AppImage';
        if (!artifact.endsWith(expectedExtension) || !fs.statSync(artifact).size) throw new Error(`Invalid updater artifact: ${artifact}`);
        const signature = fs.readFileSync(`${artifact}.sig`, 'utf8').trim();
        if (!signature || !/^[A-Za-z0-9+/=\r\n]+$/.test(signature)) throw new Error(`Missing or malformed signature: ${artifact}`);
        const name = path.basename(artifact);
        if (assetNames.has(name)) throw new Error(`Release asset filename collision: ${name}`);
        assetNames.add(name);
        platforms[platform] = { signature, url: `https://github.com/nojan01/json-viewer-editor/releases/download/v${version}/${encodeURIComponent(name)}` };
    }
    if (!entries.length) throw new Error('No signed updater artifacts');
    return { version, notes, pub_date: new Date().toISOString(), platforms };
}
function findArtifacts(directory) {
    const files = fs.readdirSync(directory,{withFileTypes:true}).flatMap(e => e.isDirectory() ? findArtifacts(path.join(directory,e.name)) : [path.join(directory,e.name)]);
    return files;
}
if (require.main === module) {
    const [version, root, output, ...explicit] = process.argv.slice(2);
    if (!version || !root || !output) throw new Error('Usage: node create-updater-manifest.cjs VERSION ARTIFACT_ROOT OUTPUT [PLATFORM=ARTIFACT ...]');
    let entries = explicit.map(entry => { const i = entry.indexOf('='); if (i < 0) throw new Error('Expected PLATFORM=ARTIFACT'); return [entry.slice(0,i),entry.slice(i+1)]; });
    if (!entries.length) {
        const files = findArtifacts(root);
        const targets = [['windows-x86_64','windows-updater','.exe'],['windows-aarch64','windows-arm64-updater','.exe'],['linux-x86_64','linux-updater','.AppImage'],['darwin-aarch64','macos-updater','.app.tar.gz']];
        entries = targets.map(([platform,folder,suffix]) => {
            const matches = files.filter(f => f.split(path.sep).includes(folder) && f.endsWith(suffix));
            if (matches.length !== 1) throw new Error(`Expected one ${platform} artifact, got ${matches.length}`);
            return [platform,matches[0]];
        });
    }
    fs.writeFileSync(output,JSON.stringify(createManifest(version,entries),null,2)+'\n');
    console.log(`Updater manifest written: ${output}`);
}
module.exports = {createManifest};
