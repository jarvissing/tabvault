// scripts/build-zip.js
// Production zip packaging script for TabVault Chrome Extension
// Packages only the runtime extension files into a zip ready for Chrome Web Store upload.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
const zipName = `tabvault-v${manifest.version}.zip`;
const zipPath = path.join(distDir, zipName);

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Remove old zip if present
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

const filesToInclude = [
  'manifest.json',
  'background.js',
  'storage-manager.js',
  'cloud-sync.js',
  'dashboard.html',
  'dashboard.css',
  'dashboard.js',
  'icons'
];

// Check all files exist
for (const item of filesToInclude) {
  const itemPath = path.join(rootDir, item);
  if (!fs.existsSync(itemPath)) {
    console.error(`ERROR: Missing required file or directory for packaging: ${item}`);
    process.exit(1);
  }
}

console.log('Packaging TabVault Chrome Extension into ZIP bundle...');

try {
  // Use PowerShell Compress-Archive for native, standard Windows zip creation
  const fileListArg = filesToInclude.map(f => `'${path.join(rootDir, f)}'`).join(',');
  const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path ${fileListArg} -DestinationPath '${zipPath}' -Force"`;
  
  execSync(psCmd, { stdio: 'inherit' });

  if (fs.existsSync(zipPath)) {
    const stats = fs.statSync(zipPath);
    console.log(`\nSUCCESS: Extension successfully packaged!\nBundle: ${zipPath}\nSize: ${(stats.size / 1024).toFixed(1)} KB`);
  } else {
    throw new Error('Zip file was not created.');
  }
} catch (err) {
  console.error('Packaging failed:', err.message);
  process.exit(1);
}
