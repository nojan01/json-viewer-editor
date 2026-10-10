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
        // GitHub normalizes spaces in uploaded release asset names to dots.
        // Generate the URL from that published name rather than the local path.
        const name = path.basename(artifact).replaceAll(' ', '.');
        if (assetNames.has(name)) throw new Error(`Release asset filename collision: ${name}`);
        assetNames.add(name);
        platforms[platform] = { signature, url: `https://github.com/nojan01/json-viewer-editor/releases/download/v${version}/${encodeURIComponent(name)}` };
    }
    if (!entries.length) throw new Error('No signed updater artifacts');
    return { version, notes, pub_date: new Date().toISOString(), platforms };
}
// Keep platforms published earlier for the same version (for example a locally
// notarized macOS build) when a run only rebuilds the other platforms.
function mergeManifest(manifest, previous) {
    if (!previous || previous.version !== manifest.version || typeof previous.platforms !== 'object' || !previous.platforms) return manifest;
    const platforms = Object.create(null);
    const prefix = `https://github.com/nojan01/json-viewer-editor/releases/download/v${manifest.version}/`;
    for (const [platform, entry] of Object.entries(previous.platforms)) {
        if (!/^(darwin|windows|linux)-(aarch64|x86_64)$/.test(platform)) continue;
        if (typeof entry?.signature !== 'string' || !entry.signature || typeof entry.url !== 'string' || !entry.url.startsWith(prefix)) continue;
        platforms[platform] = { signature: entry.signature, url: entry.url };
    }
    return { ...manifest, platforms: Object.assign(platforms, manifest.platforms) };
}
function findArtifacts(directory) {
    const files = fs.readdirSync(directory,{withFileTypes:true}).flatMap(e => e.isDirectory() ? findArtifacts(path.join(directory,e.name)) : [path.join(directory,e.name)]);
    return files;
}
if (require.main === module) {
    const args = process.argv.slice(2);
    const mergeIndex = args.indexOf('--merge');
    let previous = null, optional = new Set();
    if (mergeIndex >= 0) {
        const file = args[mergeIndex+1];
        if (!file) throw new Error('--merge requires a manifest path');
        args.splice(mergeIndex,2);
        if (fs.existsSync(file) && fs.statSync(file).size) previous = JSON.parse(fs.readFileSync(file,'utf8'));
        else console.warn(`No previous manifest at ${file}; publishing only the platforms built now.`);
        // Platforms that may be absent from this run because the merged manifest supplies them.
        optional = new Set(['darwin-aarch64']);
    }
    const [version, root, output, ...explicit] = args;
    if (!version || !root || !output) throw new Error('Usage: node create-updater-manifest.cjs VERSION ARTIFACT_ROOT OUTPUT [--merge PREVIOUS.json] [PLATFORM=ARTIFACT ...]');
    let entries = explicit.map(entry => { const i = entry.indexOf('='); if (i < 0) throw new Error('Expected PLATFORM=ARTIFACT'); return [entry.slice(0,i),entry.slice(i+1)]; });
    if (!entries.length) {
        const files = findArtifacts(root);
        const targets = [['windows-x86_64','windows-updater','.exe'],['windows-aarch64','windows-arm64-updater','.exe'],['linux-x86_64','linux-updater','.AppImage'],['darwin-aarch64','macos-updater','.app.tar.gz']];
        entries = targets.flatMap(([platform,folder,suffix]) => {
            const matches = files.filter(f => f.split(path.sep).includes(folder) && f.endsWith(suffix));
            if (!matches.length && optional.has(platform)) return [];
            if (matches.length !== 1) throw new Error(`Expected one ${platform} artifact, got ${matches.length}`);
            return [[platform,matches[0]]];
        });
    }
    const manifest = mergeManifest(createManifest(version,entries),previous);
    fs.writeFileSync(output,JSON.stringify(manifest,null,2)+'\n');
    console.log(`Updater manifest written: ${output} (${Object.keys(manifest.platforms).sort().join(', ')})`);
}
module.exports = {createManifest, mergeManifest};
