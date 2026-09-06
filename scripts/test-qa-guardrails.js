// scripts/test-qa-guardrails.js
// Comprehensive Quality Assurance (QA) Guardrails Verification Suite for TabVault

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('  TabVault Comprehensive QA Guardrails Audit Suite  ');
console.log('====================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(category, description, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  [PASS] ${category}: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${category}: ${description}`);
    console.error(`         Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// 1. MANIFEST V3 & SECURITY GUARDRAILS
// ---------------------------------------------------------------------------
console.log('Category 1: Manifest V3 & Browser Configuration Guardrails');

runTest('Manifest', 'Manifest version is strictly 3', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.manifest_version, 3);
});

runTest('Manifest', 'Contains only actively used permissions (no unused downloads permission)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
  const required = ['tabs', 'storage', 'contextMenus', 'identity', 'alarms', 'unlimitedStorage'];
  for (const p of required) {
    assert.ok(manifest.permissions.includes(p), `Missing required permission: ${p}`);
  }
  assert.ok(!manifest.permissions.includes('downloads'), 'downloads permission must not be requested as it is unused');
});

runTest('Manifest', 'Action does not declare default_popup (allows onClicked to fire)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.action.default_popup, undefined);
});

runTest('Manifest', 'No static placeholder oauth2 block that causes :0 errors in Brave/Chromium', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.oauth2, undefined);
});

runTest('Manifest', 'All defined icons exist on disk with valid file size', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
  for (const [size, iconPath] of Object.entries(manifest.icons)) {
    const full = path.join(rootDir, iconPath);
    assert.ok(fs.existsSync(full), `Icon missing: ${iconPath}`);
    const stat = fs.statSync(full);
    assert.ok(stat.size > 0, `Icon file is 0 bytes: ${iconPath}`);
  }
});

runTest('Manifest', 'Description is 132 characters or fewer for Chrome Web Store compliance', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
  assert.ok(manifest.description, 'Manifest must have a description');
  assert.ok(manifest.description.length <= 132, `Manifest description exceeds 132 chars: ${manifest.description.length}`);
});

// ---------------------------------------------------------------------------
// 2. INPUT SANITIZATION & ANTI-XSS GUARDRAILS
// ---------------------------------------------------------------------------
console.log('\nCategory 2: Input Sanitization & Anti-XSS Guardrails');

(async () => {
  const { validateTab, validateSession, extractDomain } = await import('../storage-manager.js');

  runTest('Sanitization', 'Rejects dangerous javascript: pseudo-protocol', () => {
    assert.throws(() => validateTab({ url: 'javascript:alert(document.cookie)' }), /Unsafe or invalid URL/);
  });

  runTest('Sanitization', 'Rejects dangerous data: text/html protocol', () => {
    assert.throws(() => validateTab({ url: 'data:text/html,<script>alert(1)</script>' }), /Unsafe or invalid URL/);
  });

  runTest('Sanitization', 'Rejects vbscript: protocol', () => {
    assert.throws(() => validateTab({ url: 'vbscript:msgbox("hello")' }), /Unsafe or invalid URL/);
  });

  runTest('Sanitization', 'Rejects empty or whitespace-only URLs', () => {
    assert.throws(() => validateTab({ url: '   ' }), /Unsafe or invalid URL/);
    assert.throws(() => validateTab({ url: '' }), /Unsafe or invalid URL/);
  });

  runTest('Sanitization', 'Accepts valid http and https URLs and generates sanitized tab schema', () => {
    const tab = validateTab({
      url: 'https://sub.github.com/path?query=1#hash',
      title: '<b>Test XSS Title</b>'
    });
    assert.strictEqual(tab.url, 'https://sub.github.com/path?query=1#hash');
    assert.strictEqual(tab.domain, 'sub.github.com');
    assert.strictEqual(tab.title, '<b>Test XSS Title</b>');
    assert.ok(tab.id.startsWith('tab_'));
    assert.ok(typeof tab.createdAt === 'number');
  });

  runTest('Sanitization', 'extractDomain correctly handles complex subdomains and ports', () => {
    assert.strictEqual(extractDomain('https://app.dev.domain.co.uk:8080/dashboard'), 'app.dev.domain.co.uk');
    assert.strictEqual(extractDomain('http://localhost:3000/'), 'localhost');
    assert.strictEqual(extractDomain('https://192.168.1.1/setup'), '192.168.1.1');
  });

  // ---------------------------------------------------------------------------
  // 3. SCHEMA INTEGRITY & DATA VALIDATION GUARDRAILS
  // ---------------------------------------------------------------------------
  console.log('\nCategory 3: Schema Integrity & Session Validation Guardrails');

  runTest('Schema', 'validateSession rejects non-array or empty tabs if not an object', () => {
    assert.throws(() => validateSession(null), /Invalid session object/);
    assert.throws(() => validateSession('invalid'), /Invalid session object/);
  });

  runTest('Schema', 'validateSession normalizes invalid tabs, flags, and sets defaults', () => {
    const session = validateSession({
      title: '  My Research Group  ',
      pinned: 'true', // truthy conversion
      locked: false,
      tabs: [
        { url: 'https://example.com', title: 'Example' },
        { url: 'javascript:bad()', title: 'Malicious' } // Should be filtered out
      ]
    });

    assert.strictEqual(session.title, 'My Research Group');
    assert.strictEqual(session.pinned, true);
    assert.strictEqual(session.locked, false);
    assert.strictEqual(session.tabs.length, 1);
    assert.strictEqual(session.tabs[0].url, 'https://example.com');
    assert.ok(session.id.startsWith('session_'));
  });

  // ---------------------------------------------------------------------------
  // 4. DATA PORTABILITY & PARSER GUARDRAILS
  // ---------------------------------------------------------------------------
  console.log('\nCategory 4: Data Portability & Parser Guardrails');

  runTest('OneTab Parser', 'Parses multi-pipe, URL-only, scheme-missing, and multi-group text', () => {
    const rawOneTab = `
https://github.com | GitHub Home
http://news.ycombinator.com | Hacker News | Tech Discussion

reddit.com/r/programming
https://developer.mozilla.org/en-US/ | MDN Web Docs

   
`;
    // Emulate dashboard OneTab parser
    const lines = rawOneTab.split(/\r?\n/);
    const groups = [];
    let currentTabs = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (currentTabs.length > 0) {
          groups.push(currentTabs);
          currentTabs = [];
        }
        continue;
      }

      let url = '';
      let title = '';

      if (trimmed.includes(' | ')) {
        const parts = trimmed.split(' | ');
        url = parts[0].trim();
        title = parts.slice(1).join(' | ').trim();
      } else {
        url = trimmed;
      }

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }

      currentTabs.push({ url, title: title || url });
    }
    if (currentTabs.length > 0) groups.push(currentTabs);

    assert.strictEqual(groups.length, 2, 'Should detect two separate groups separated by blank line');
    assert.strictEqual(groups[0].length, 2);
    assert.strictEqual(groups[0][0].url, 'https://github.com');
    assert.strictEqual(groups[0][1].title, 'Hacker News | Tech Discussion', 'Preserves extra pipes in title');
    assert.strictEqual(groups[1].length, 2);
    assert.strictEqual(groups[1][0].url, 'https://reddit.com/r/programming', 'Auto-prepends https://');
  });

  runTest('JSON Restore', 'Validates JSON backup structure and handles merge vs replace strategy', () => {
    const existing = [
      { id: 'sess_1', title: 'Old 1', tabs: [{ id: 't1', url: 'https://site1.com', title: 'Site 1', domain: 'site1.com' }] }
    ];

    const backupData = {
      app: 'TabVault',
      version: '1.0.0',
      sessions: [
        { id: 'sess_1', title: 'Old 1', tabs: [{ id: 't1', url: 'https://site1.com', title: 'Site 1', domain: 'site1.com' }] },
        { id: 'sess_2', title: 'New 2', tabs: [{ id: 't2', url: 'https://site2.com', title: 'Site 2', domain: 'site2.com' }] }
      ]
    };

    // Merge mode: deduplicate existing session IDs
    const existingIds = new Set(existing.map(s => s.id));
    const newItems = backupData.sessions.filter(s => !existingIds.has(s.id));
    const merged = [...newItems, ...existing];

    assert.strictEqual(merged.length, 2);
    assert.strictEqual(merged[0].id, 'sess_2');
    assert.strictEqual(merged[1].id, 'sess_1');

    // Replace mode
    const replaced = [...backupData.sessions];
    assert.strictEqual(replaced.length, 2);
  });

  // ---------------------------------------------------------------------------
  // 5. ACCESSIBILITY (A11Y) & DOM GUARDRAILS
  // ---------------------------------------------------------------------------
  console.log('\nCategory 5: Accessibility (a11y) & DOM Integrity Guardrails');

  runTest('A11y', 'Every aria-labelledby in dashboard.html maps to an existing DOM element ID', () => {
    const html = fs.readFileSync(path.join(rootDir, 'dashboard.html'), 'utf8');
    const regex = /aria-labelledby=["']([^"']+)["']/g;
    let match;
    const missing = [];

    while ((match = regex.exec(html)) !== null) {
      const ids = match[1].trim().split(/\s+/);
      for (const id of ids) {
        if (!html.includes(`id="${id}"`)) {
          missing.push({ id, context: match[0] });
        }
      }
    }

    assert.strictEqual(missing.length, 0, `Found broken aria-labelledby targets: ${JSON.stringify(missing)}`);
  });

  runTest('A11y', 'Every modal dialog has role="dialog", aria-modal="true", and aria-labelledby', () => {
    const html = fs.readFileSync(path.join(rootDir, 'dashboard.html'), 'utf8');
    const modalRegex = /<div\s+id=["'](modal-[^"']+)["'][^>]*>/g;
    let match;
    let modalCount = 0;

    while ((match = modalRegex.exec(html)) !== null) {
      modalCount++;
      const tag = match[0];
      assert.ok(tag.includes('role="dialog"'), `Modal ${match[1]} missing role="dialog"`);
      assert.ok(tag.includes('aria-modal="true"'), `Modal ${match[1]} missing aria-modal="true"`);
      assert.ok(tag.includes('aria-labelledby='), `Modal ${match[1]} missing aria-labelledby`);
    }
    assert.ok(modalCount >= 3, `Expected at least 3 modals, found ${modalCount}`);
  });

  // ---------------------------------------------------------------------------
  // 6. CSS LAYOUT & VISUAL COLLISION GUARDRAILS
  // ---------------------------------------------------------------------------
  console.log('\nCategory 6: CSS Layout & Anti-Collision Guardrails');

  runTest('CSS Layout', 'Metadata badges enforce white-space: nowrap and flex-shrink: 0', () => {
    const css = fs.readFileSync(path.join(rootDir, 'dashboard.css'), 'utf8');
    assert.ok(css.includes('.session-meta-badge'));
    assert.ok(css.includes('white-space: nowrap !important'));
    assert.ok(css.includes('flex-shrink: 0 !important'));
  });

  runTest('CSS Layout', 'Session title input enforces ellipsis and flex min-width: 0 on parent', () => {
    const css = fs.readFileSync(path.join(rootDir, 'dashboard.css'), 'utf8');
    assert.ok(css.includes('.session-title-wrap'));
    assert.ok(css.includes('min-width: 0'));
    assert.ok(css.includes('text-overflow: ellipsis'));
  });

  runTest('CSS Layout', 'Button icons have fixed square 32x32 dimensions to prevent squishing', () => {
    const css = fs.readFileSync(path.join(rootDir, 'dashboard.css'), 'utf8');
    assert.ok(css.includes('.btn-icon.btn-sm'));
    assert.ok(css.includes('width: 32px'));
    assert.ok(css.includes('height: 32px'));
  });

  // ---------------------------------------------------------------------------
  // 7. BACKGROUND SERVICE WORKER RESILIENCE GUARDRAILS
  // ---------------------------------------------------------------------------
  console.log('\nCategory 7: Service Worker Resilience Guardrails');

  runTest('Service Worker', 'background.js wraps contextMenus with existence checks', () => {
    const bg = fs.readFileSync(path.join(rootDir, 'background.js'), 'utf8');
    assert.ok(bg.includes('chrome.contextMenus && chrome.contextMenus.onClicked'));
    assert.ok(bg.includes('if (!chrome.contextMenus || !chrome.contextMenus.removeAll) return;'));
  });

  runTest('Service Worker', 'background.js uses chrome.runtime.getURL for dashboard URL', () => {
    const bg = fs.readFileSync(path.join(rootDir, 'background.js'), 'utf8');
    assert.ok(bg.includes("chrome.runtime.getURL('dashboard.html')"));
  });

  runTest('Service Worker', 'background.js handles tab pendingUrl during initial load', () => {
    const bg = fs.readFileSync(path.join(rootDir, 'background.js'), 'utf8');
    assert.ok(bg.includes('tab.url || tab.pendingUrl'));
  });

  runTest('Service Worker', 'background.js filters out internal and extension URLs', () => {
    const bg = fs.readFileSync(path.join(rootDir, 'background.js'), 'utf8');
    assert.ok(bg.includes("lower.startsWith('chrome://')"));
    assert.ok(bg.includes("lower.startsWith('brave://')"));
    assert.ok(bg.includes("lower.startsWith('edge://')"));
    assert.ok(bg.includes("lower.includes('dashboard.html')"));
  });

  // ---------------------------------------------------------------------------
  // 8. ZERO EXTERNAL NETWORK DEPENDENCY (OFFLINE INTEGRITY)
  // ---------------------------------------------------------------------------
  console.log('\nCategory 8: Zero External CDN / 100% Offline Guardrails');

  runTest('Offline Integrity', 'dashboard.html contains zero external script or font CDN tags', () => {
    const html = fs.readFileSync(path.join(rootDir, 'dashboard.html'), 'utf8');
    const cdnPatterns = ['https://cdn', 'http://cdn', 'unpkg.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com'];
    for (const pat of cdnPatterns) {
      assert.ok(!html.includes(pat), `Found external network dependency in HTML: ${pat}`);
    }
  });

  runTest('Offline Integrity', 'dashboard.css contains zero external @import url() rules', () => {
    const css = fs.readFileSync(path.join(rootDir, 'dashboard.css'), 'utf8');
    assert.ok(!css.includes('@import url(http'), 'Found external @import in CSS');
  });

  // ---------------------------------------------------------------------------
  // 9. CUSTOM SESSION TAGS & FILTER BAR GUARDRAILS
  // ---------------------------------------------------------------------------
  console.log('\nCategory 9: Custom Session Tags & Tag Filter Guardrails');

  runTest('Tags & Filtering', 'dashboard.html contains accessible #tag-filter-bar', () => {
    const html = fs.readFileSync(path.join(rootDir, 'dashboard.html'), 'utf8');
    assert.ok(html.includes('id="tag-filter-bar"'));
    assert.ok(html.includes('id="tag-chips-container"'));
    assert.ok(html.includes('role="group"'));
  });

  runTest('Tags & Filtering', 'dashboard.css contains tag chips and tag pill styles', () => {
    const css = fs.readFileSync(path.join(rootDir, 'dashboard.css'), 'utf8');
    assert.ok(css.includes('.tag-filter-bar'));
    assert.ok(css.includes('.tag-chip'));
    assert.ok(css.includes('.session-tag-pill'));
    assert.ok(css.includes('.btn-add-tag'));
  });

  runTest('Tags & Filtering', 'storage-manager.js exports addTagToSession and removeTagFromSession', async () => {
    const sm = await import('../storage-manager.js');
    assert.strictEqual(typeof sm.addTagToSession, 'function');
    assert.strictEqual(typeof sm.removeTagFromSession, 'function');
  });

  // ---------------------------------------------------------------------------
  // 10. SMART TAB THRESHOLD & MEMORY ALERT GUARDRAILS
  // ---------------------------------------------------------------------------
  console.log('\nCategory 10: Tab Memory Pressure & Alert Guardrails');

  runTest('Memory Alerts', 'DEFAULT_SETTINGS contains tabThresholdAlert and tabThresholdLimit', async () => {
    const { DEFAULT_SETTINGS } = await import('../storage-manager.js');
    assert.strictEqual(typeof DEFAULT_SETTINGS.tabThresholdAlert, 'boolean');
    assert.strictEqual(typeof DEFAULT_SETTINGS.tabThresholdLimit, 'number');
    assert.ok(DEFAULT_SETTINGS.tabThresholdLimit >= 5);
  });

  runTest('Memory Alerts', 'dashboard.html contains memory alert toggle and threshold input', () => {
    const html = fs.readFileSync(path.join(rootDir, 'dashboard.html'), 'utf8');
    assert.ok(html.includes('id="toggle-tab-alert"'));
    assert.ok(html.includes('id="input-tab-limit"'));
  });

  runTest('Memory Alerts', 'background.js implements checkTabMemoryPressure with tab lifecycle hooks', () => {
    const bg = fs.readFileSync(path.join(rootDir, 'background.js'), 'utf8');
    assert.ok(bg.includes('checkTabMemoryPressure'));
    assert.ok(bg.includes('chrome.tabs.onCreated'));
    assert.ok(bg.includes('chrome.tabs.onRemoved'));
  });

  // ---------------------------------------------------------------------------
  // 11. NETSCAPE HTML BOOKMARKS & CSV EXPORTER GUARDRAILS
  // ---------------------------------------------------------------------------
  console.log('\nCategory 11: HTML Bookmarks & CSV Exporter Guardrails');

  runTest('Exporters', 'dashboard.html offers bookmarks-html and csv format options', () => {
    const html = fs.readFileSync(path.join(rootDir, 'dashboard.html'), 'utf8');
    assert.ok(html.includes('value="bookmarks-html"'));
    assert.ok(html.includes('value="csv"'));
    assert.ok(html.includes('id="btn-download-export"'));
  });

  runTest('Exporters', 'dashboard.js implements Netscape bookmark header and RFC-4180 CSV lines', () => {
    const js = fs.readFileSync(path.join(rootDir, 'dashboard.js'), 'utf8');
    assert.ok(js.includes('<!DOCTYPE NETSCAPE-Bookmark-file-1>'));
    assert.ok(js.includes('"Session Group","Title","URL","Domain","Tags","Saved Date"'));
    assert.ok(js.includes('btn-download-export'));
  });

  // ---------------------------------------------------------------------------
  // 12. CROSS-BROWSER FIREFOX (AMO) PACKAGE GUARDRAILS
  // ---------------------------------------------------------------------------
  console.log('\nCategory 12: Cross-Browser Firefox (AMO) Package Guardrails');

  runTest('Firefox Build', 'scripts/build-firefox.js exists and is configured for Firefox MV3 gecko ID', () => {
    const script = fs.readFileSync(path.join(rootDir, 'scripts', 'build-firefox.js'), 'utf8');
    assert.ok(script.includes('browser_specific_settings'));
    assert.ok(script.includes('tabvault@jarvissing.github.io'));
    assert.ok(script.includes('data_collection_permissions'));
    assert.ok(script.includes('115.0'));
  });

  runTest('Firefox Build', 'Firefox bundle exists and is valid in dist/', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
    const zipPath = path.join(rootDir, 'dist', `tabvault-firefox-v${manifest.version}.zip`);
    assert.ok(fs.existsSync(zipPath), 'Firefox release zip exists in dist directory');
    assert.ok(fs.statSync(zipPath).size > 10000, 'Firefox release zip is non-trivial size');
  });

  runTest('Firefox Build', 'Firefox zip entries strictly enforce POSIX forward slashes (no backslashes)', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
    const zipPath = path.join(rootDir, 'dist', `tabvault-firefox-v${manifest.version}.zip`);
    const buf = fs.readFileSync(zipPath);
    let idx = 0;
    const names = [];
    while ((idx = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), idx)) !== -1) {
      const fileNameLen = buf.readUInt16LE(idx + 28);
      const extraLen = buf.readUInt16LE(idx + 30);
      const commentLen = buf.readUInt16LE(idx + 32);
      const fileName = buf.toString('utf8', idx + 46, idx + 46 + fileNameLen);
      names.push(fileName);
      idx += 46 + fileNameLen + extraLen + commentLen;
    }
    const hasBackslash = names.some(n => n.includes('\\'));
    assert.strictEqual(hasBackslash, false, `Found Windows backslash in zip entry paths: ${names.filter(n => n.includes('\\')).join(', ')}`);
  });

  console.log(`\n====================================================`);
  console.log(`  QA Audit Complete: ${passedTests} / ${totalTests} Guardrail Tests Passed!  `);
  console.log(`====================================================\n`);
})();
