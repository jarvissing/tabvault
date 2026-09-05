// scripts/generate-screenshots.js
// Automated 1280x800 screenshot generator for Chrome Web Store submission.
// Produces 24-bit PNGs (no alpha) matching Google Chrome Web Store specification.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const assetsDir = path.join(rootDir, 'store-assets');

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

console.log('Generating Chrome Web Store screenshots (1280x800 24-bit PNG)...');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if (!fs.existsSync(chromePath)) {
  console.error('Chrome executable not found at: ' + chromePath);
  process.exit(1);
}

// Read CSS to inline into preview HTML
const cssContent = fs.readFileSync(path.join(rootDir, 'dashboard.css'), 'utf8');

function createPreviewHtml(activeModal = null) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <title>TabVault Dashboard</title>
  <style>
    ${cssContent}
    body { width: 1280px; height: 800px; margin: 0; overflow: hidden; background: #0B0F19; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .header-bar { padding: 12px 28px; }
    .search-toolbar-container { padding: 12px 28px; }
    .main-container { padding: 8px 28px 28px; height: 620px; overflow-y: auto; }
  </style>
</head>
<body>
  <header class="header-bar">
    <div class="brand-group">
      <div class="brand-logo">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="3" y1="9" x2="21" y2="9"></line>
          <line x1="9" y1="21" x2="9" y2="9"></line>
        </svg>
      </div>
      <div>
        <h1 class="brand-title">TabVault</h1>
        <p class="brand-subtitle">Zero-Data-Loss Tab Manager</p>
      </div>
    </div>

    <div class="stats-counter" role="status">
      <div class="stat-item"><span class="stat-value">35</span><span class="stat-label">Tabs</span></div>
      <div class="stat-divider"></div>
      <div class="stat-item"><span class="stat-value">3</span><span class="stat-label">Groups</span></div>
      <div class="stat-divider"></div>
      <div class="stat-item"><span class="stat-value" style="color: #10B981;">5.3 GB</span><span class="stat-label">RAM Freed</span></div>
      <div class="stat-divider"></div>
      <div class="stat-item cloud-status-item">
        <span class="status-dot connected"></span>
        <span class="stat-label" style="color: #10B981; font-weight: 500;">Google Drive Synced</span>
      </div>
    </div>

    <div class="header-actions">
      <button class="btn btn-sm btn-primary">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
        <span>Collapse Tabs</span>
      </button>
      <button class="btn btn-sm btn-secondary">Import / Export</button>
      <button class="btn btn-sm btn-secondary">Drive Sync</button>
      <button class="btn-icon btn-sm"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button>
    </div>
  </header>

  <div class="search-toolbar-container">
    <div class="search-box">
      <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <input type="search" placeholder="Search saved tabs, titles, or domains... (Press '/' to focus)" value="">
    </div>
    <div class="toolbar-filters">
      <div class="filter-group"><label>Sort:</label><select class="select-dropdown"><option>Date: Newest First</option></select></div>
      <div class="filter-group"><label>Show:</label><select class="select-dropdown"><option>All Groups</option></select></div>
      <button class="btn btn-sm btn-outline"><span>Clean Duplicates</span></button>
    </div>
    <div class="tag-filter-bar">
      <span class="tag-filter-label">Tags:</span>
      <div class="tag-chips-container">
        <button class="tag-chip active"><span>All</span><span class="tag-chip-count">3</span></button>
        <button class="tag-chip"><span>#Work</span><span class="tag-chip-count">2</span></button>
        <button class="tag-chip"><span>#Dev</span><span class="tag-chip-count">2</span></button>
        <button class="tag-chip"><span>#Reading</span><span class="tag-chip-count">1</span></button>
      </div>
    </div>
  </div>

  <main class="main-container">
    <div class="sessions-container">
      <!-- Session 1 -->
      <article class="session-card">
        <div class="session-header">
          <div class="session-title-wrap">
            <span class="session-color-pip" style="background: #6366F1;"></span>
            <input class="session-title-input" value="Sprint 42 — Architecture & Web Store Release">
            <div class="session-tags-wrap">
              <span class="session-tag-pill">#Work</span>
              <span class="session-tag-pill">#Dev</span>
            </div>
          </div>
          <div class="session-header-meta">
            <span class="session-meta-badge">4 tabs</span>
            <span class="session-meta-badge">~600 MB RAM</span>
            <span class="session-timestamp">Saved today, 2:15 PM</span>
            <div class="session-actions">
              <button class="btn btn-xs btn-primary">Restore All</button>
              <button class="btn-icon btn-sm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg></button>
              <button class="btn-icon btn-sm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
          </div>
        </div>
        <ul class="tab-list">
          <li class="tab-item">
            <div class="tab-drag-handle">⋮⋮</div>
            <div class="tab-content">
              <span class="tab-title">Chrome Web Store Developer Dashboard — Item Management</span>
              <span class="tab-domain">chrome.google.com</span>
            </div>
            <div class="tab-actions">
              <button class="btn-icon btn-xs"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></button>
            </div>
          </li>
          <li class="tab-item">
            <div class="tab-drag-handle">⋮⋮</div>
            <div class="tab-content">
              <span class="tab-title">GitHub - jarvissing/tabvault: Production Zero-Data-Loss Tab Manager</span>
              <span class="tab-domain">github.com</span>
            </div>
            <div class="tab-actions">
              <button class="btn-icon btn-xs"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></button>
            </div>
          </li>
          <li class="tab-item">
            <div class="tab-drag-handle">⋮⋮</div>
            <div class="tab-content">
              <span class="tab-title">Figma — TabVault UI/UX Specifications & Asset Canvas</span>
              <span class="tab-domain">figma.com</span>
            </div>
            <div class="tab-actions">
              <button class="btn-icon btn-xs"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></button>
            </div>
          </li>
        </ul>
      </article>

      <!-- Session 2 -->
      <article class="session-card">
        <div class="session-header">
          <div class="session-title-wrap">
            <span class="session-color-pip" style="background: #10B981;"></span>
            <input class="session-title-input" value="Core Engineering & Security Documentation">
            <div class="session-tags-wrap">
              <span class="session-tag-pill">#Dev</span>
            </div>
          </div>
          <div class="session-header-meta">
            <span class="session-meta-badge">3 tabs</span>
            <span class="session-meta-badge">~450 MB RAM</span>
            <span class="session-timestamp">Saved today, 11:30 AM</span>
            <div class="session-actions">
              <button class="btn btn-xs btn-primary">Restore All</button>
              <button class="btn-icon btn-sm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg></button>
              <button class="btn-icon btn-sm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
          </div>
        </div>
      </article>
    </div>
  </main>

  ${activeModal === 'export' ? `
  <div class="modal-overlay" style="display: flex;">
    <div class="modal-card" style="max-width: 680px;">
      <div class="modal-header">
        <h2>Data Portability & Migration Engine</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-tabs">
        <button class="modal-tab">OneTab Import</button>
        <button class="modal-tab active">Notion / Markdown / Bookmarks</button>
        <button class="modal-tab">JSON Backup</button>
      </div>
      <div class="modal-body" style="padding: 18px 0 0;">
        <div class="export-options" style="margin-bottom: 14px;">
          <div class="form-group-inline">
            <label>Format:</label>
            <select class="select-dropdown" style="font-weight: 600;">
              <option>HTML Bookmarks (.html for browser import)</option>
              <option>CSV Spreadsheet (.csv)</option>
              <option>Markdown Bullet List (- [Title](URL))</option>
            </select>
          </div>
          <div class="form-group-inline">
            <label>Scope:</label>
            <select class="select-dropdown"><option>All Sessions (35 tabs)</option></select>
          </div>
        </div>
        <textarea class="code-textarea" rows="8" readonly style="font-family: monospace; font-size: 12px; line-height: 1.5; color: #94A3B8;">&lt;!DOCTYPE NETSCAPE-Bookmark-file-1&gt;
&lt;TITLE&gt;Bookmarks&lt;/TITLE&gt;
&lt;H1&gt;Bookmarks&lt;/H1&gt;
&lt;DL&gt;&lt;p&gt;
    &lt;DT&gt;&lt;H3 ADD_DATE="1725540000"&gt;Sprint 42 — Architecture &amp; Web Store Release&lt;/H3&gt;
    &lt;DL&gt;&lt;p&gt;
        &lt;DT&gt;&lt;A HREF="https://chrome.google.com/webstore"&gt;Chrome Web Store Developer Dashboard&lt;/A&gt;
        &lt;DT&gt;&lt;A HREF="https://github.com/jarvissing/tabvault"&gt;GitHub - jarvissing/tabvault: Production Tab Manager&lt;/A&gt;
        &lt;DT&gt;&lt;A HREF="https://figma.com"&gt;Figma — TabVault UI/UX Specifications&lt;/A&gt;
    &lt;/DL&gt;&lt;p&gt;
&lt;/DL&gt;&lt;p&gt;</textarea>
        <div class="tab-pane-actions" style="margin-top: 14px; display: flex; gap: 10px;">
          <button class="btn btn-primary">Copy to Clipboard</button>
          <button class="btn btn-secondary">Download File (.html)</button>
        </div>
      </div>
    </div>
  </div>
  ` : ''}

  ${activeModal === 'drive' ? `
  <div class="modal-overlay" style="display: flex;">
    <div class="modal-card" style="max-width: 620px;">
      <div class="modal-header">
        <h2>Google Drive Cloud Sync</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body" style="padding: 16px 0 0;">
        <div class="cloud-info-card">
          <div class="cloud-info-header">
            <div class="drive-icon-badge">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>
            </div>
            <div>
              <h3>Automated Zero-Data-Loss Protection</h3>
              <p>Snapshots are stored inside your personal Google Drive account. Zero developer servers, zero tracking.</p>
            </div>
          </div>
        </div>
        <div class="settings-group" style="margin: 16px 0;">
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-title">Automated Background Sync</span>
              <span class="setting-subtitle">Auto backup sessions every 24 hours & after window collapse</span>
            </div>
            <label class="toggle-switch"><input type="checkbox" checked><span class="slider"></span></label>
          </div>
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-title">Drive Storage Location</span>
              <span class="setting-subtitle">Private App Data Folder (Hidden, zero clutter)</span>
            </div>
            <select class="select-dropdown"><option>Private App Data Folder</option></select>
          </div>
        </div>
        <div class="cloud-action-row" style="display: flex; gap: 10px;">
          <button class="btn btn-primary">Backup to Drive Now</button>
          <button class="btn btn-secondary">List Cloud Snapshots</button>
        </div>
      </div>
    </div>
  </div>
  ` : ''}
</body>
</html>`;
}

// Generate the 3 preview HTML files
fs.writeFileSync(path.join(assetsDir, 'preview-dashboard.html'), createPreviewHtml(null), 'utf8');
fs.writeFileSync(path.join(assetsDir, 'preview-export.html'), createPreviewHtml('export'), 'utf8');
fs.writeFileSync(path.join(assetsDir, 'preview-drive.html'), createPreviewHtml('drive'), 'utf8');

console.log('Preview HTML pages created.');
