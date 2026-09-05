const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const assetsDir = path.join(rootDir, 'store-assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// 1. Build an HTML snapshot with mock sessions
const mockHtmlPath = path.join(assetsDir, 'dashboard-preview.html');
const cssContent = fs.readFileSync(path.join(rootDir, 'dashboard.css'), 'utf8');

const previewHtml = <!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <title>TabVault Dashboard</title>
  <style>
    
    body { min-width: 1280px; width: 1280px; height: 800px; overflow: hidden; }
  </style>
</head>
<body>
  <!-- Header Bar -->
  <header class="header">
    <div class="logo-area">
      <div class="logo-icon-wrap">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="3" y1="9" x2="21" y2="9"></line>
          <line x1="9" y1="21" x2="9" y2="9"></line>
        </svg>
      </div>
      <div>
        <h1 class="logo-text">TabVault</h1>
        <div class="cloud-status">
          <span class="status-dot connected"></span>
          <span class="cloud-status-text">Drive Synced 2m ago</span>
        </div>
      </div>
    </div>

    <!-- Live Metrics Counter Bar -->
    <div class="metrics-bar">
      <div class="metric-item">
        <span class="metric-val">12</span>
        <span class="metric-label">Saved Tabs</span>
      </div>
      <div class="metric-item">
        <span class="metric-val">3</span>
        <span class="metric-label">Groups</span>
      </div>
      <div class="metric-item">
        <span class="metric-val text-success">1.8 GB</span>
        <span class="metric-label">RAM Saved</span>
      </div>
    </div>

    <!-- Header Quick Actions -->
    <div class="header-actions">
      <button class="btn btn-primary btn-sm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 14 10 14 10 20"></polyline>
          <polyline points="20 10 14 10 14 4"></polyline>
          <line x1="14" y1="10" x2="21" y2="3"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
        <span>Collapse Window</span>
      </button>
      <button class="btn btn-secondary btn-sm">
        <span>+ New Group</span>
      </button>
      <button class="btn btn-secondary btn-sm">Import / Export</button>
      <button class="btn btn-icon btn-sm" aria-label="Settings">⚙</button>
    </div>
  </header>

  <!-- Sticky Search & Filter Toolbar -->
  <div class="toolbar-container">
    <div class="toolbar-row">
      <div class="search-wrap">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="text" class="search-input" value="Search saved tabs or press '/'..." readonly>
      </div>

      <div class="filter-controls">
        <select class="select-dropdown"><option>Sort: Date (Newest)</option></select>
        <select class="select-dropdown"><option>Show: All Tabs</option></select>
        <button class="btn btn-secondary btn-sm">Clean Duplicates</button>
      </div>
    </div>

    <!-- Category & Tag Filter Bar -->
    <div class="tag-filter-bar">
      <span class="tag-filter-label">Tags:</span>
      <div class="tag-chips-container">
        <button class="tag-chip active"><span>All</span><span class="tag-chip-count">3</span></button>
        <button class="tag-chip"><span>#Work</span><span class="tag-chip-count">1</span></button>
        <button class="tag-chip"><span>#Dev</span><span class="tag-chip-count">1</span></button>
        <button class="tag-chip"><span>#AI-Research</span><span class="tag-chip-count">1</span></button>
        <button class="tag-chip"><span>#Reading</span><span class="tag-chip-count">1</span></button>
      </div>
    </div>
  </div>

  <!-- Main Sessions Workspace -->
  <main class="main-container" style="padding-bottom: 20px;">
    <div class="sessions-container">
      
      <!-- Session Card 1 -->
      <article class="session-card" style="border-left-color: #6366F1;">
        <div class="session-header">
          <div class="session-title-wrap">
            <input type="text" class="session-title-input" value="🚀 Production Deployment & Infrastructure" readonly>
            <div class="session-tags-wrap">
              <span class="session-tag-pill">#Work</span>
              <span class="session-tag-pill">#Dev</span>
              <button class="btn-add-tag">+ Tag</button>
            </div>
            <span class="session-meta-badge">5 tabs &bull; Saved today at 11:20 AM</span>
          </div>
          <div class="session-actions">
            <button class="btn btn-primary btn-sm">Restore All</button>
            <button class="btn btn-secondary btn-sm">+ Tab</button>
            <button class="btn btn-icon btn-sm">Export</button>
            <button class="btn btn-icon btn-sm">🗑</button>
          </div>
        </div>
        <ul class="tab-list">
          <li class="tab-item">
            <div class="tab-info">
              <img class="tab-favicon" src="../icons/icon-16.png">
              <span class="tab-title">Pull Request #142: Zero-data-loss architecture &bull; GitHub</span>
              <span class="tab-domain">github.com</span>
            </div>
            <div class="tab-actions">
              <button class="btn-tab-action">Open</button>
              <button class="btn-tab-action">Copy</button>
              <button class="btn-tab-action">×</button>
            </div>
          </li>
          <li class="tab-item">
            <div class="tab-info">
              <img class="tab-favicon" src="../icons/icon-16.png">
              <span class="tab-title">Google Cloud Console — Cloud Run Services & IAM</span>
              <span class="tab-domain">console.cloud.google.com</span>
            </div>
            <div class="tab-actions">
              <button class="btn-tab-action">Open</button>
              <button class="btn-tab-action">Copy</button>
              <button class="btn-tab-action">×</button>
            </div>
          </li>
          <li class="tab-item">
            <div class="tab-info">
              <img class="tab-favicon" src="../icons/icon-16.png">
              <span class="tab-title">Datadog APM Dashboard: Latency & Error Budgets</span>
              <span class="tab-domain">app.datadoghq.com</span>
            </div>
            <div class="tab-actions">
              <button class="btn-tab-action">Open</button>
              <button class="btn-tab-action">Copy</button>
              <button class="btn-tab-action">×</button>
            </div>
          </li>
        </ul>
      </article>

      <!-- Session Card 2 -->
      <article class="session-card" style="border-left-color: #10B981;">
        <div class="session-header">
          <div class="session-title-wrap">
            <input type="text" class="session-title-input" value="📚 Machine Learning & Deep Research" readonly>
            <div class="session-tags-wrap">
              <span class="session-tag-pill">#AI-Research</span>
              <span class="session-tag-pill">#Reading</span>
              <button class="btn-add-tag">+ Tag</button>
            </div>
            <span class="session-meta-badge">4 tabs &bull; Saved yesterday at 4:45 PM</span>
          </div>
          <div class="session-actions">
            <button class="btn btn-primary btn-sm">Restore All</button>
            <button class="btn btn-secondary btn-sm">+ Tab</button>
            <button class="btn btn-icon btn-sm">Export</button>
            <button class="btn btn-icon btn-sm">🗑</button>
          </div>
        </div>
        <ul class="tab-list">
          <li class="tab-item">
            <div class="tab-info">
              <img class="tab-favicon" src="../icons/icon-16.png">
              <span class="tab-title">Attention Is All You Need — Transformer Architecture Deep Dive</span>
              <span class="tab-domain">arxiv.org</span>
            </div>
            <div class="tab-actions">
              <button class="btn-tab-action">Open</button>
              <button class="btn-tab-action">Copy</button>
              <button class="btn-tab-action">×</button>
            </div>
          </li>
          <li class="tab-item">
            <div class="tab-info">
              <img class="tab-favicon" src="../icons/icon-16.png">
              <span class="tab-title">Hugging Face Models — Open Source LLM Leaderboard</span>
              <span class="tab-domain">huggingface.co</span>
            </div>
            <div class="tab-actions">
              <button class="btn-tab-action">Open</button>
              <button class="btn-tab-action">Copy</button>
              <button class="btn-tab-action">×</button>
            </div>
          </li>
        </ul>
      </article>

    </div>
  </main>
</body>
</html>
;

fs.writeFileSync(mockHtmlPath, previewHtml, 'utf8');

// 2. Launch Chrome Headless to capture exactly 1280x800
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const screenshotPath = path.join(assetsDir, 'screenshot-1280x800.png');
const tempProfile = path.join(os.tmpdir(), 'chrome_shot_' + Date.now());

console.log('Capturing 1280x800 Chrome Web Store Screenshot...');
const cmd = "" --headless=new --user-data-dir="" --screenshot="" --window-size=1280,800 "file:///";

try {
  execSync(cmd, { stdio: 'inherit' });
  if (fs.existsSync(screenshotPath)) {
    const stats = fs.statSync(screenshotPath);
    console.log(SUCCESS: Screenshot created!\\nPath: \\nSize:  KB);
  } else {
    throw new Error('Screenshot was not generated');
  }
} catch (err) {
  console.error('Screenshot capture failed:', err.message);
}
