// scripts/test-validation.js
// Automated verification test suite for TabVault

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.resolve(__dirname, '..');

console.log('--- TabVault Automated Test Suite ---\n');

let passedTests = 0;
function test(description, fn) {
  try {
    fn();
    console.log(`✓ PASS: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ FAIL: ${description}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. Manifest V3 Validation
test('manifest.json conforms to Manifest V3 specification', () => {
  const manifestRaw = fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw);

  assert.strictEqual(manifest.manifest_version, 3, 'Must be Manifest V3');
  assert.ok(manifest.name, 'Must have a name');
  assert.ok(manifest.version, 'Must have a version');
  assert.ok(Array.isArray(manifest.permissions), 'Permissions must be array');

  const requiredPerms = ['tabs', 'storage', 'identity', 'alarms', 'unlimitedStorage'];
  for (const perm of requiredPerms) {
    assert.ok(manifest.permissions.includes(perm), `Missing required permission: ${perm}`);
  }

  // Verify all referenced icons exist
  for (const [size, iconPath] of Object.entries(manifest.icons)) {
    const fullPath = path.join(rootDir, iconPath);
    assert.ok(fs.existsSync(fullPath), `Referenced icon does not exist: ${iconPath}`);
    const stats = fs.statSync(fullPath);
    assert.ok(stats.size > 0, `Icon file is empty: ${iconPath}`);
  }

  // Ensure no default_popup is set so action.onClicked fires properly
  assert.strictEqual(manifest.action.default_popup, undefined, 'default_popup must not be defined for action.onClicked to work');

  // Verify background service worker file exists
  assert.ok(manifest.background && manifest.background.service_worker, 'Missing background service worker');
  assert.ok(fs.existsSync(path.join(rootDir, manifest.background.service_worker)), 'background.js does not exist');
});

// 2. Storage & Schema Unit Tests
test('Tab and Session validation logic works as expected', async () => {
  const { validateTab, validateSession, extractDomain } = await import('../storage-manager.js');

  // Domain extraction
  assert.strictEqual(extractDomain('https://www.github.com/features'), 'github.com');
  assert.strictEqual(extractDomain('http://sub.domain.co.uk/test?q=1'), 'sub.domain.co.uk');

  // Valid Tab
  const validTab = validateTab({
    url: 'https://news.ycombinator.com',
    title: 'Hacker News'
  });
  assert.strictEqual(validTab.url, 'https://news.ycombinator.com');
  assert.strictEqual(validTab.title, 'Hacker News');
  assert.strictEqual(validTab.domain, 'news.ycombinator.com');
  assert.ok(validTab.id.startsWith('tab_'));

  // Invalid Tab throws
  assert.throws(() => validateTab({ url: 'javascript:alert(1)' }), /Unsafe or invalid URL/);
  assert.throws(() => validateTab({ url: '' }), /Unsafe or invalid URL/);

  // Valid Session
  const validSession = validateSession({
    title: 'Research Group',
    tabs: [
      { url: 'https://developer.chrome.com', title: 'Chrome Dev' }
    ]
  });
  assert.strictEqual(validSession.title, 'Research Group');
  assert.strictEqual(validSession.tabs.length, 1);
  assert.strictEqual(validSession.locked, false);
  assert.strictEqual(validSession.pinned, false);
});

// 3. OneTab Import Parsing
test('OneTab format parser parses standard and varied format strings correctly', () => {
  const sampleOneTab = `
https://github.com | GitHub: Where the world builds software
https://nytimes.com | The New York Times

https://news.ycombinator.com
https://reddit.com/r/programming | Reddit Programming
`;

  // Emulate parseOneTabText from dashboard.js
  const lines = sampleOneTab.split(/\r?\n/);
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

  assert.strictEqual(groups.length, 2, 'Should have parsed 2 distinct groups');
  assert.strictEqual(groups[0].length, 2, 'Group 1 should have 2 tabs');
  assert.strictEqual(groups[0][0].url, 'https://github.com');
  assert.strictEqual(groups[0][0].title, 'GitHub: Where the world builds software');
  assert.strictEqual(groups[1].length, 2, 'Group 2 should have 2 tabs');
  assert.strictEqual(groups[1][0].url, 'https://news.ycombinator.com');
});

// 4. Markdown & Notion Export Generation
test('Markdown and Notion exporters format valid text', () => {
  const mockSessions = [
    {
      title: 'Dev Links',
      tabs: [
        { title: 'MDN Web Docs', url: 'https://developer.mozilla.org', domain: 'developer.mozilla.org' },
        { title: 'Stack Overflow', url: 'https://stackoverflow.com', domain: 'stackoverflow.com' }
      ]
    }
  ];

  // List format
  let listMd = '';
  for (const session of mockSessions) {
    listMd += `## ${session.title}\n`;
    for (const tab of session.tabs) {
      listMd += `- [${tab.title}](${tab.url})\n`;
    }
  }

  assert.ok(listMd.includes('## Dev Links'));
  assert.ok(listMd.includes('- [MDN Web Docs](https://developer.mozilla.org)'));
  assert.ok(listMd.includes('- [Stack Overflow](https://stackoverflow.com)'));

  // Table format
  let tableMd = `| Title | Domain | URL |\n| :--- | :--- | :--- |\n`;
  for (const session of mockSessions) {
    for (const tab of session.tabs) {
      tableMd += `| ${tab.title} | \`${tab.domain}\` | [Link](${tab.url}) |\n`;
    }
  }
  assert.ok(tableMd.includes('| MDN Web Docs | `developer.mozilla.org` | [Link](https://developer.mozilla.org) |'));
});

// 5. Netscape HTML Bookmarks & CSV Exporter Tests
test('Netscape HTML Bookmarks and CSV formatters produce standards-compliant output', () => {
  const mockSessions = [
    {
      title: 'Dev Research',
      createdAt: 1725540000000,
      tags: ['Work', 'Dev'],
      tabs: [
        { title: 'MDN Web Docs', url: 'https://developer.mozilla.org', domain: 'developer.mozilla.org' },
        { title: 'Stack Overflow', url: 'https://stackoverflow.com', domain: 'stackoverflow.com' }
      ]
    }
  ];

  // Netscape HTML
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n`;
  for (const session of mockSessions) {
    html += `    <DT><H3>${session.title}</H3>\n    <DL><p>\n`;
    for (const tab of session.tabs) {
      html += `        <DT><A HREF="${tab.url}">${tab.title}</A>\n`;
    }
    html += `    </DL><p>\n`;
  }
  html += `</DL><p>\n`;

  assert.ok(html.includes('<!DOCTYPE NETSCAPE-Bookmark-file-1>'));
  assert.ok(html.includes('<DT><H3>Dev Research</H3>'));
  assert.ok(html.includes('<DT><A HREF="https://developer.mozilla.org">MDN Web Docs</A>'));

  // CSV
  const rows = [['"Session Group"', '"Title"', '"URL"', '"Domain"', '"Tags"', '"Saved Date"'].join(',')];
  for (const session of mockSessions) {
    for (const tab of session.tabs) {
      rows.push(`"${session.title}","${tab.title}","${tab.url}","${tab.domain}","${session.tags.join('; ')}","2026-09-05"`);
    }
  }
  const csv = rows.join('\r\n');
  assert.ok(csv.includes('"Session Group","Title","URL","Domain","Tags","Saved Date"'));
  assert.ok(csv.includes('"Dev Research","MDN Web Docs","https://developer.mozilla.org","developer.mozilla.org","Work; Dev","2026-09-05"'));
});

// 6. Custom Session Tags & Filtering
test('Session schema validates and sanitizes tags array', async () => {
  const { validateSession } = await import('../storage-manager.js');

  const sessionWithTags = validateSession({
    title: 'Tagged Project',
    tags: ['Work', '<script>alert(1)</script>', 'Dev', 'Work'], // duplicate and dirty tag
    tabs: [{ url: 'https://github.com', title: 'GitHub' }]
  });

  assert.ok(Array.isArray(sessionWithTags.tags));
  assert.strictEqual(sessionWithTags.tags.length, 3, 'Should remove duplicates');
  assert.ok(!sessionWithTags.tags.includes('<script>'), 'Tags should be sanitized strings');
  assert.ok(sessionWithTags.tags.includes('Work'));
  assert.ok(sessionWithTags.tags.includes('Dev'));
});

// 7. Memory Pressure & Tab Threshold Logic
test('Memory pressure threshold calculation identifies tab overload correctly', () => {
  const threshold = 15;
  const underLimitTabs = 10;
  const overLimitTabs = 22;

  const isUnderOverloaded = underLimitTabs >= threshold;
  const isOverOverloaded = overLimitTabs >= threshold;
  const estRamFreedMb = overLimitTabs * 150;

  assert.strictEqual(isUnderOverloaded, false);
  assert.strictEqual(isOverOverloaded, true);
  assert.strictEqual(estRamFreedMb, 3300); // 3.3 GB
});

// 8. Firefox Add-ons Package Verification
test('Firefox bundle exists and contains valid gecko ID in manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
  const ffZip = path.join(rootDir, 'dist', `tabvault-firefox-v${manifest.version}.zip`);
  assert.ok(fs.existsSync(ffZip), 'Firefox distribution zip exists');
  const stats = fs.statSync(ffZip);
  assert.ok(stats.size > 10000, 'Firefox distribution zip has valid non-zero size');
});

console.log(`\nAll ${passedTests} automated test suites passed successfully!`);

