// scripts/build-firefox.js
// Production zip packaging script for TabVault Firefox Add-ons (AMO) release
// Creates a Firefox MV3 compliant package with gecko ID and proper configuration.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const tempDir = path.join(distDir, 'firefox-temp');
const baseManifestData = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
const zipName = `tabvault-firefox-v${baseManifestData.version}.zip`;
const zipPath = path.join(distDir, zipName);

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Clean previous temp directory or zip
if (fs.existsSync(tempDir)) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

fs.mkdirSync(tempDir, { recursive: true });

console.log('Building TabVault for Firefox Add-ons (AMO)...');

// 1. Read and adapt manifest.json for Firefox
const baseManifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));

const firefoxManifest = {
  ...baseManifest,
  browser_specific_settings: {
    gecko: {
      id: 'tabvault@jarvissing.github.io',
      strict_min_version: '115.0',
      data_collection_permissions: {
        required: ['none']
      }
    }
  },
  // Firefox MV3 background configuration
  background: {
    scripts: ['background.js'],
    type: 'module'
  }
};

fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify(firefoxManifest, null, 2), 'utf8');

// 2. Copy runtime extension files
const filesToCopy = [
  'background.js',
  'storage-manager.js',
  'cloud-sync.js',
  'dashboard.html',
  'dashboard.css',
  'dashboard.js'
];

for (const file of filesToCopy) {
  fs.copyFileSync(path.join(rootDir, file), path.join(tempDir, file));
}

// Copy icons directory
const iconsSrcDir = path.join(rootDir, 'icons');
const iconsDestDir = path.join(tempDir, 'icons');
fs.mkdirSync(iconsDestDir, { recursive: true });
for (const icon of fs.readdirSync(iconsSrcDir)) {
  fs.copyFileSync(path.join(iconsSrcDir, icon), path.join(iconsDestDir, icon));
}

// 3. Compress into zip archive using tar.exe (enforces standard POSIX forward slashes for AMO compatibility)
try {
  const items = fs.readdirSync(tempDir);
  const itemsArg = items.map(i => `"${i}"`).join(' ');
  const tarCmd = `tar.exe -a -cf "${zipPath}" -C "${tempDir}" ${itemsArg}`;
  execSync(tarCmd, { stdio: 'inherit' });

  // 4. Clean up temporary staging directory
  fs.rmSync(tempDir, { recursive: true, force: true });

  if (fs.existsSync(zipPath)) {
    const stats = fs.statSync(zipPath);
    console.log(`\nSUCCESS: Firefox Add-on package successfully generated!\nBundle: ${zipPath}\nSize: ${(stats.size / 1024).toFixed(1)} KB`);
  } else {
    throw new Error('Firefox zip file was not created.');
  }
} catch (err) {
  console.error('Firefox packaging failed:', err.message);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  process.exit(1);
}
