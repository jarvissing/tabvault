// dashboard.js
// Production Dashboard Controller for TabVault
// Manages sessions rendering, drag-and-drop, search filtering, undo stack,
// OneTab migration, Notion/Markdown exports, and Google Drive cloud sync.

import {
  getSessions,
  saveSessions,
  createSession,
  updateSession,
  deleteSession,
  deleteTab,
  restoreTabToSession,
  reorderTabs,
  moveTabAcrossSessions,
  deduplicateSession,
  getSettings,
  saveSettings,
  getStorageStats,
  getCrashRecoveryStaging,
  clearCrashRecoveryStaging,
  extractDomain,
  validateTab,
  validateSession,
  addTagToSession,
  removeTagFromSession
} from './storage-manager.js';

import {
  backupToGoogleDrive,
  listGoogleDriveBackups,
  restoreFromGoogleDrive
} from './cloud-sync.js';

// Application State
let sessionsState = [];
let settingsState = {};
let searchQuery = '';
let currentSort = 'newest';
let currentFilter = 'all';
let activeTagFilter = 'ALL';

// Undo Stack State
let undoItem = null;
let undoTimer = null;
const UNDO_DURATION = 7000; // 7 seconds

// Drag & Drop tracking
let draggedTabId = null;
let draggedSourceSessionId = null;

// DOM Elements
const sessionsContainer = document.getElementById('sessions-container');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const sortSelect = document.getElementById('sort-select');
const filterSelect = document.getElementById('filter-select');
const btnDedupAll = document.getElementById('btn-dedup-all');

// Metrics elements
const statTabs = document.getElementById('stat-tabs');
const statGroups = document.getElementById('stat-groups');
const statRam = document.getElementById('stat-ram');
const cloudStatusText = document.getElementById('cloud-status-text');
const cloudDot = document.getElementById('cloud-dot');

// Crash Banner
const crashBanner = document.getElementById('crash-banner');
const btnCrashSave = document.getElementById('btn-crash-save');
const btnCrashDismiss = document.getElementById('btn-crash-dismiss');

// Toast Elements
const undoToast = document.getElementById('undo-toast');
const toastMessage = document.getElementById('toast-message');
const toastUndoBtn = document.getElementById('toast-undo-btn');
const toastProgressBar = document.getElementById('toast-progress-bar');

// Modals
const modalImportExport = document.getElementById('modal-import-export');
const modalCloudSync = document.getElementById('modal-cloud-sync');
const modalSettings = document.getElementById('modal-settings');
const modalAddTab = document.getElementById('modal-add-tab');

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadSessions();
  await checkCrashStaging();
  setupEventListeners();
  setupModalHandlers();
  setupKeyboardShortcuts();
});

async function loadSettings() {
  settingsState = await getSettings();
  applyTheme(settingsState.theme);
  updateCloudStatusBadge();
  updateStorageMeter();
  populateSettingsForm();
}

async function loadSessions() {
  sessionsState = await getSessions();
  renderDashboard();
  await updateMetrics();
}

function applyTheme(theme) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme || 'dark');
  }
}

// ==========================================================================
// Metrics & Statistics Calculation
// ==========================================================================
async function updateMetrics() {
  const stats = await getStorageStats();
  statTabs.textContent = stats.totalTabs;
  statGroups.textContent = stats.totalSessions;
  statRam.textContent = stats.ramDisplay;
}

function updateCloudStatusBadge() {
  if (settingsState.driveConnected) {
    cloudDot.className = 'status-dot connected';
    if (settingsState.lastCloudBackup) {
      const timeDiff = Math.floor((Date.now() - settingsState.lastCloudBackup) / 60000);
      cloudStatusText.textContent = timeDiff < 1 ? 'Synced just now' : `Synced ${timeDiff}m ago`;
    } else {
      cloudStatusText.textContent = 'Drive Connected';
    }
  } else {
    cloudDot.className = 'status-dot disconnected';
    cloudStatusText.textContent = 'Local only';
  }
}

async function updateStorageMeter() {
  const stats = await getStorageStats();
  const usageVal = document.getElementById('storage-usage-val');
  const barFill = document.getElementById('storage-bar-fill');
  if (usageVal && barFill) {
    usageVal.textContent = stats.bytesDisplay;
    // Calculate approximate percent of typical quota (5MB default soft scale)
    const pct = Math.min(100, Math.max(2, (stats.bytesInUse / (5 * 1024 * 1024)) * 100));
    barFill.style.width = `${pct}%`;
  }
}

// ==========================================================================
// Crash Recovery Check
// ==========================================================================
async function checkCrashStaging() {
  const staging = await getCrashRecoveryStaging();
  if (staging && Array.isArray(staging.tabs) && staging.tabs.length > 0) {
    crashBanner.classList.remove('hidden');
    
    btnCrashSave.onclick = async () => {
      await createSession(staging.tabs, 'Recovered Crash Session');
      await clearCrashRecoveryStaging();
      crashBanner.classList.add('hidden');
      await loadSessions();
      showToast('Crash tabs successfully saved to vault!');
    };

    btnCrashDismiss.onclick = async () => {
      await clearCrashRecoveryStaging();
      crashBanner.classList.add('hidden');
    };
  }
}

// ==========================================================================
// Category & Tag Filter Bar
// ==========================================================================
function renderTagFilterBar() {
  const container = document.getElementById('tag-chips-container');
  if (!container) return;
  container.innerHTML = '';

  const tagCounts = {};
  sessionsState.forEach(s => {
    if (Array.isArray(s.tags)) {
      s.tags.forEach(t => {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    }
  });

  // "All" chip
  const allChip = document.createElement('button');
  allChip.className = `tag-chip ${activeTagFilter === 'ALL' ? 'active' : ''}`;
  const allLabel = document.createElement('span');
  allLabel.textContent = 'All';
  const allCount = document.createElement('span');
  allCount.className = 'tag-chip-count';
  allCount.textContent = String(sessionsState.length);
  allChip.appendChild(allLabel);
  allChip.appendChild(allCount);
  allChip.addEventListener('click', () => {
    activeTagFilter = 'ALL';
    renderDashboard();
  });
  container.appendChild(allChip);

  // Individual tag chips
  const sortedTags = Object.keys(tagCounts).sort();
  sortedTags.forEach(tag => {
    const chip = document.createElement('button');
    chip.className = `tag-chip ${activeTagFilter === tag ? 'active' : ''}`;
    const tagLabel = document.createElement('span');
    tagLabel.textContent = `#${tag}`;
    const tagCount = document.createElement('span');
    tagCount.className = 'tag-chip-count';
    tagCount.textContent = String(tagCounts[tag]);
    chip.appendChild(tagLabel);
    chip.appendChild(tagCount);
    chip.addEventListener('click', () => {
      activeTagFilter = activeTagFilter === tag ? 'ALL' : tag;
      renderDashboard();
    });
    container.appendChild(chip);
  });
}

// ==========================================================================
// Dashboard Rendering
// ==========================================================================
function renderDashboard() {
  sessionsContainer.innerHTML = '';

  // Render Category Tag Filter Bar
  renderTagFilterBar();

  let filtered = [...sessionsState];

  // Apply Tag Filter
  if (activeTagFilter !== 'ALL') {
    filtered = filtered.filter(s => Array.isArray(s.tags) && s.tags.includes(activeTagFilter));
  }

  // Apply Search Query
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.map(session => {
      const matchedTabs = session.tabs.filter(t => 
        t.title.toLowerCase().includes(q) || 
        t.url.toLowerCase().includes(q) || 
        t.domain.toLowerCase().includes(q)
      );
      const sessionTitleMatch = session.title.toLowerCase().includes(q);
      if (sessionTitleMatch || matchedTabs.length > 0) {
        return {
          ...session,
          tabs: sessionTitleMatch ? session.tabs : matchedTabs
        };
      }
      return null;
    }).filter(Boolean);
  }

  // Apply Filter Dropdown
  if (currentFilter === 'pinned') {
    filtered = filtered.filter(s => s.pinned);
  } else if (currentFilter === 'locked') {
    filtered = filtered.filter(s => s.locked);
  }

  // Apply Sort Dropdown
  filtered.sort((a, b) => {
    // Pinned sessions always on top unless filtering
    if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;

    switch (currentSort) {
      case 'oldest':
        return a.createdAt - b.createdAt;
      case 'count':
        return b.tabs.length - a.tabs.length;
      case 'title':
        return a.title.localeCompare(b.title);
      case 'newest':
      default:
        return b.createdAt - a.createdAt;
    }
  });

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
    filtered.forEach(session => {
      const card = createSessionCard(session);
      sessionsContainer.appendChild(card);
    });
  }
}

function createSessionCard(session) {
  const card = document.createElement('div');
  card.className = `session-card ${session.pinned ? 'pinned' : ''}`;
  card.dataset.sessionId = session.id;

  const dateFormatted = new Date(session.createdAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Header Section
  const header = document.createElement('div');
  header.className = 'session-header';

  // Title Wrap
  const titleWrap = document.createElement('div');
  titleWrap.className = 'session-title-wrap';

  const colorTag = document.createElement('span');
  colorTag.className = 'session-color-tag';
  colorTag.style.backgroundColor = session.color || '#6366F1';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'session-title-input';
  titleInput.value = session.title;
  titleInput.title = 'Click to edit session name';
  titleInput.id = `session-title-${session.id}`;
  titleInput.setAttribute('aria-label', `Session title: ${session.title}`);

  // Inline Title Editing Handlers
  let originalTitle = session.title;
  titleInput.addEventListener('focus', () => {
    originalTitle = titleInput.value;
  });
  titleInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      titleInput.blur();
    } else if (e.key === 'Escape') {
      titleInput.value = originalTitle;
      titleInput.blur();
    }
  });
  titleInput.addEventListener('blur', async () => {
    const newTitle = titleInput.value.trim();
    if (newTitle && newTitle !== originalTitle) {
      await updateSession(session.id, { title: newTitle });
      session.title = newTitle;
      titleInput.setAttribute('aria-label', `Session title: ${newTitle}`);
    } else {
      titleInput.value = originalTitle;
    }
  });

  const metaWrap = document.createElement('div');
  metaWrap.className = 'session-meta-wrap';

  const tabCountBadge = document.createElement('span');
  tabCountBadge.className = 'session-meta-badge tab-count';
  tabCountBadge.textContent = `${session.tabs.length} ${session.tabs.length === 1 ? 'tab' : 'tabs'}`;

  const dateBadge = document.createElement('span');
  dateBadge.className = 'session-meta-badge session-date';
  dateBadge.textContent = dateFormatted;
  dateBadge.title = new Date(session.createdAt).toISOString();

  metaWrap.appendChild(tabCountBadge);
  metaWrap.appendChild(dateBadge);

  // Session Category Tags
  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'session-tags-wrap';

  if (Array.isArray(session.tags)) {
    session.tags.forEach(tag => {
      const tagPill = document.createElement('span');
      tagPill.className = 'session-tag-pill';
      tagPill.textContent = `#${tag}`;
      tagPill.title = `Filter by #${tag}`;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove-tag';
      removeBtn.title = `Remove tag #${tag}`;
      removeBtn.setAttribute('aria-label', `Remove tag ${tag}`);
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await removeTagFromSession(session.id, tag);
        await loadSessions();
      });

      tagPill.appendChild(removeBtn);
      tagPill.addEventListener('click', (e) => {
        if (e.target !== removeBtn) {
          activeTagFilter = tag;
          renderDashboard();
        }
      });
      tagsWrap.appendChild(tagPill);
    });
  }

  const addTagBtn = document.createElement('button');
  addTagBtn.className = 'btn-add-tag';
  addTagBtn.textContent = '+ Tag';
  addTagBtn.title = 'Add category tag to session';
  addTagBtn.setAttribute('aria-label', 'Add category tag');
  addTagBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const tag = prompt('Enter a tag label (e.g. Work, Dev, Reading, Shopping):');
    if (tag && tag.trim()) {
      await addTagToSession(session.id, tag.trim());
      await loadSessions();
    }
  });
  tagsWrap.appendChild(addTagBtn);

  titleWrap.appendChild(colorTag);
  titleWrap.appendChild(titleInput);
  titleWrap.appendChild(metaWrap);
  titleWrap.appendChild(tagsWrap);

  // Actions Wrap
  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'session-actions';

  // Pin Button
  const pinBtn = document.createElement('button');
  pinBtn.className = `btn btn-icon btn-sm ${session.pinned ? 'active' : ''}`;
  pinBtn.title = session.pinned ? 'Unpin Group' : 'Pin Group to Top';
  pinBtn.setAttribute('aria-label', session.pinned ? 'Unpin Group' : 'Pin Group to Top');
  pinBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="${session.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
  pinBtn.addEventListener('click', async () => {
    const updated = await updateSession(session.id, { pinned: !session.pinned });
    session.pinned = updated.pinned;
    renderDashboard();
  });

  // Lock Button
  const lockBtn = document.createElement('button');
  lockBtn.className = `btn btn-icon btn-sm ${session.locked ? 'active' : ''}`;
  lockBtn.title = session.locked ? 'Locked (Protected from deletion)' : 'Lock Group';
  lockBtn.setAttribute('aria-label', session.locked ? 'Unlock Group' : 'Lock Group');
  lockBtn.innerHTML = session.locked
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
  lockBtn.addEventListener('click', async () => {
    const updated = await updateSession(session.id, { locked: !session.locked });
    session.locked = updated.locked;
    renderDashboard();
  });

  // Restore All Button
  const restoreAllBtn = document.createElement('button');
  restoreAllBtn.className = 'btn btn-secondary btn-sm';
  restoreAllBtn.setAttribute('aria-label', `Restore all tabs in session ${session.title}`);
  restoreAllBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg><span>Restore All</span>`;
  restoreAllBtn.addEventListener('click', async () => {
    await restoreAllTabs(session);
  });

  // Add Custom Tab Button
  const addTabBtn = document.createElement('button');
  addTabBtn.className = 'btn btn-icon btn-sm';
  addTabBtn.title = 'Add URL to this group';
  addTabBtn.setAttribute('aria-label', `Add URL to session ${session.title}`);
  addTabBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  addTabBtn.addEventListener('click', () => {
    openAddTabModal(session.id);
  });

  // Export Group Button
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-icon btn-sm';
  exportBtn.title = 'Export this group (Markdown / Notion)';
  exportBtn.setAttribute('aria-label', `Export session ${session.title}`);
  exportBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>`;
  exportBtn.addEventListener('click', () => {
    openExportForSession(session);
  });

  // Delete Group Button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-icon btn-sm';
  deleteBtn.title = session.locked ? 'Session is locked' : 'Delete Group';
  deleteBtn.setAttribute('aria-label', `Delete session ${session.title}`);
  deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
  if (session.locked) {
    deleteBtn.style.opacity = '0.4';
    deleteBtn.style.cursor = 'not-allowed';
  } else {
    deleteBtn.addEventListener('click', async () => {
      await handleDeleteSession(session);
    });
  }

  actionsWrap.appendChild(pinBtn);
  actionsWrap.appendChild(lockBtn);
  actionsWrap.appendChild(restoreAllBtn);
  actionsWrap.appendChild(addTabBtn);
  actionsWrap.appendChild(exportBtn);
  actionsWrap.appendChild(deleteBtn);

  header.appendChild(titleWrap);
  header.appendChild(actionsWrap);
  card.appendChild(header);

  // Tabs List Section
  const tabsList = document.createElement('ul');
  tabsList.className = 'tabs-list';
  tabsList.dataset.sessionId = session.id;

  session.tabs.forEach((tab, index) => {
    const tabItem = createTabItem(session, tab, index);
    tabsList.appendChild(tabItem);
  });

  // Drag over container handler
  tabsList.addEventListener('dragover', (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(tabsList, e.clientY);
    const draggingElement = document.querySelector('.dragging');
    if (draggingElement) {
      if (afterElement == null) {
        tabsList.appendChild(draggingElement);
      } else {
        tabsList.insertBefore(draggingElement, afterElement);
      }
    }
  });

  tabsList.addEventListener('drop', async (e) => {
    e.preventDefault();
    const targetSessionId = session.id;
    if (!draggedTabId || !draggedSourceSessionId) return;

    // Determine target index
    const children = Array.from(tabsList.querySelectorAll('.tab-item'));
    const targetIndex = children.findIndex(el => el.dataset.tabId === draggedTabId);

    if (draggedSourceSessionId === targetSessionId) {
      const sourceIndex = session.tabs.findIndex(t => t.id === draggedTabId);
      if (sourceIndex !== -1 && targetIndex !== -1 && sourceIndex !== targetIndex) {
        await reorderTabs(targetSessionId, sourceIndex, targetIndex);
        await loadSessions();
      }
    } else {
      await moveTabAcrossSessions(draggedSourceSessionId, targetSessionId, draggedTabId, targetIndex !== -1 ? targetIndex : 0);
      await loadSessions();
    }
  });

  card.appendChild(tabsList);
  return card;
}

function createTabItem(session, tab, index) {
  const li = document.createElement('li');
  li.className = 'tab-item';
  li.draggable = true;
  li.dataset.tabId = tab.id;
  li.dataset.sessionId = session.id;

  // Drag events
  li.addEventListener('dragstart', () => {
    draggedTabId = tab.id;
    draggedSourceSessionId = session.id;
    li.classList.add('dragging');
  });

  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    draggedTabId = null;
    draggedSourceSessionId = null;
  });

  // Main Clickable Tab Area
  const tabMain = document.createElement('div');
  tabMain.className = 'tab-main';

  // Favicon or Fallback
  if (tab.favIconUrl) {
    const img = document.createElement('img');
    img.src = tab.favIconUrl;
    img.className = 'tab-favicon';
    img.alt = '';
    img.onerror = () => {
      img.replaceWith(createFallbackIcon(tab.domain));
    };
    tabMain.appendChild(img);
  } else {
    tabMain.appendChild(createFallbackIcon(tab.domain));
  }

  // Title
  const titleSpan = document.createElement('span');
  titleSpan.className = 'tab-title';
  titleSpan.textContent = tab.title;
  titleSpan.title = `${tab.title}\n${tab.url}`;
  titleSpan.addEventListener('click', async (e) => {
    e.preventDefault();
    await restoreSingleTab(session, tab);
  });
  tabMain.appendChild(titleSpan);

  // Domain Badge
  const domainBadge = document.createElement('span');
  domainBadge.className = 'tab-domain-tag';
  domainBadge.textContent = tab.domain;
  tabMain.appendChild(domainBadge);

  // Hover Actions
  const tabActions = document.createElement('div');
  tabActions.className = 'tab-actions';

  // 1. Open / Restore Button
  const openBtn = document.createElement('button');
  openBtn.className = 'tab-action-btn';
  openBtn.title = 'Open tab';
  openBtn.setAttribute('aria-label', `Open tab ${tab.title}`);
  openBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
  openBtn.addEventListener('click', async () => {
    await restoreSingleTab(session, tab);
  });

  // 2. Copy Link Button
  const copyBtn = document.createElement('button');
  copyBtn.className = 'tab-action-btn';
  copyBtn.title = 'Copy URL';
  copyBtn.setAttribute('aria-label', `Copy URL for ${tab.title}`);
  copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  copyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(tab.url);
    showToast('URL copied to clipboard');
  });

  // 3. Delete Tab Button
  const delBtn = document.createElement('button');
  delBtn.className = 'tab-action-btn delete';
  delBtn.title = 'Delete tab';
  delBtn.setAttribute('aria-label', `Delete tab ${tab.title}`);
  delBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  delBtn.addEventListener('click', async () => {
    await handleDeleteTab(session, tab);
  });

  tabActions.appendChild(openBtn);
  tabActions.appendChild(copyBtn);
  tabActions.appendChild(delBtn);

  li.appendChild(tabMain);
  li.appendChild(tabActions);
  return li;
}

function createFallbackIcon(domain) {
  const icon = document.createElement('div');
  icon.className = 'tab-fallback-icon';
  icon.textContent = (domain && domain[0]) ? domain[0].toUpperCase() : 'W';
  return icon;
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.tab-item:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ==========================================================================
// Tab Actions (Restore, Delete, Undo)
// ==========================================================================
async function restoreSingleTab(session, tab) {
  await chrome.tabs.create({ url: tab.url, active: false });

  if (settingsState.removeOnRestore) {
    const res = await deleteTab(session.id, tab.id);
    if (res) {
      // Setup undo
      setUndoAction(`Restored & removed "${tab.title}"`, async () => {
        await restoreTabToSession(session.id, tab, res.tabIndex);
        await loadSessions();
      });
    }
    await loadSessions();
  }
}

async function restoreAllTabs(session) {
  const urls = session.tabs.map(t => t.url);
  if (urls.length === 0) return;

  if (settingsState.openInNewWindow) {
    await chrome.windows.create({ url: urls });
  } else {
    for (const url of urls) {
      await chrome.tabs.create({ url, active: false });
    }
  }

  if (settingsState.removeOnRestore && !session.locked) {
    const deleted = await deleteSession(session.id, true);
    if (deleted) {
      setUndoAction(`Restored & archived "${session.title}"`, async () => {
        const sessions = await getSessions();
        sessions.unshift(deleted);
        await saveSessions(sessions);
        await loadSessions();
      });
    }
    await loadSessions();
  }
}

async function handleDeleteTab(session, tab) {
  const res = await deleteTab(session.id, tab.id);
  if (!res) return;

  await loadSessions();
  setUndoAction(`Deleted "${tab.title}"`, async () => {
    await restoreTabToSession(session.id, tab, res.tabIndex);
    await loadSessions();
  });
}

async function handleDeleteSession(session) {
  try {
    const deleted = await deleteSession(session.id);
    if (!deleted) return;

    await loadSessions();
    setUndoAction(`Deleted session "${session.title}"`, async () => {
      const sessions = await getSessions();
      sessions.unshift(deleted);
      await saveSessions(sessions);
      await loadSessions();
    });
  } catch (err) {
    alert(err.message);
  }
}

// ==========================================================================
// Undo Toast System
// ==========================================================================
function setUndoAction(message, undoCallback) {
  if (undoTimer) {
    clearTimeout(undoTimer);
  }

  undoItem = undoCallback;
  toastMessage.textContent = message;
  undoToast.classList.remove('hidden');

  // Reset & run progress bar animation
  toastProgressBar.style.transition = 'none';
  toastProgressBar.style.width = '100%';

  requestAnimationFrame(() => {
    toastProgressBar.style.transition = `width ${UNDO_DURATION}ms linear`;
    toastProgressBar.style.width = '0%';
  });

  undoTimer = setTimeout(() => {
    hideToast();
  }, UNDO_DURATION);
}

function hideToast() {
  undoToast.classList.add('hidden');
  undoItem = null;
}

function showToast(message) {
  toastMessage.textContent = message;
  toastUndoBtn.style.display = 'none';
  undoToast.classList.remove('hidden');
  toastProgressBar.style.width = '0%';

  setTimeout(() => {
    undoToast.classList.add('hidden');
    toastUndoBtn.style.display = '';
  }, 3000);
}

// ==========================================================================
// OneTab Import & Migration Engine
// ==========================================================================
function parseOneTabText(rawText) {
  const lines = rawText.split(/\r?\n/);
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
    } else if (trimmed.includes(' ')) {
      const firstSpace = trimmed.indexOf(' ');
      const possibleUrl = trimmed.substring(0, firstSpace).trim();
      if (possibleUrl.startsWith('http://') || possibleUrl.startsWith('https://')) {
        url = possibleUrl;
        title = trimmed.substring(firstSpace + 1).trim();
      } else {
        url = trimmed;
      }
    } else {
      url = trimmed;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    try {
      const valid = validateTab({ url, title });
      currentTabs.push(valid);
    } catch {
      // Skip invalid URLs
    }
  }

  if (currentTabs.length > 0) {
    groups.push(currentTabs);
  }

  return groups;
}

async function handleOneTabImport() {
  const pasteArea = document.getElementById('onetab-paste-area');
  const statusMsg = document.getElementById('onetab-import-status');
  const rawText = pasteArea.value.trim();

  if (!rawText) {
    statusMsg.textContent = 'Please paste OneTab export text first.';
    statusMsg.style.color = '#EF4444';
    return;
  }

  const groups = parseOneTabText(rawText);
  if (groups.length === 0) {
    statusMsg.textContent = 'No valid URLs could be extracted.';
    statusMsg.style.color = '#EF4444';
    return;
  }

  let totalTabs = 0;
  for (let i = 0; i < groups.length; i++) {
    const tabs = groups[i];
    await createSession(tabs, `OneTab Import #${i + 1} (${tabs.length} tabs)`);
    totalTabs += tabs.length;
  }

  pasteArea.value = '';
  statusMsg.textContent = `Successfully imported ${totalTabs} tabs across ${groups.length} groups!`;
  statusMsg.style.color = '#10B981';

  await loadSessions();
}

// ==========================================================================
// Notion & Markdown Export Engine
// ==========================================================================
function generateExportContent(format, scopeSessionId = 'all') {
  let targetSessions = sessionsState;
  if (scopeSessionId !== 'all') {
    targetSessions = sessionsState.filter(s => s.id === scopeSessionId);
  }

  if (format === 'markdown-list') {
    let md = `# TabVault Export (${new Date().toLocaleDateString()})\n\n`;
    for (const session of targetSessions) {
      md += `## ${session.title}\n`;
      for (const tab of session.tabs) {
        md += `- [${tab.title}](${tab.url})\n`;
      }
      md += '\n';
    }
    return md;
  } else if (format === 'markdown-table') {
    let md = `# TabVault Tab Index\n\n`;
    for (const session of targetSessions) {
      md += `### ${session.title}\n\n`;
      md += `| Title | Domain | URL |\n`;
      md += `| :--- | :--- | :--- |\n`;
      for (const tab of session.tabs) {
        const cleanTitle = tab.title.replace(/\|/g, '-');
        md += `| ${cleanTitle} | \`${tab.domain}\` | [Link](${tab.url}) |\n`;
      }
      md += '\n';
    }
    return md;
  } else if (format === 'notion-links') {
    let text = '';
    for (const session of targetSessions) {
      text += `--- ${session.title} ---\n`;
      for (const tab of session.tabs) {
        text += `${tab.title}\n${tab.url}\n\n`;
      }
    }
    return text;
  } else if (format === 'bookmarks-html') {
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;
    for (const session of targetSessions) {
      const cleanTitle = (session.title || 'TabVault Session').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const dateAdded = Math.floor(new Date(session.createdAt || Date.now()).getTime() / 1000);
      html += `    <DT><H3 ADD_DATE="${dateAdded}">${cleanTitle}</H3>\n    <DL><p>\n`;
      for (const tab of session.tabs) {
        const tabTitle = (tab.title || tab.url).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const tabUrl = (tab.url || '').replace(/"/g, '&quot;');
        const tabDate = Math.floor(new Date(tab.addedAt || session.createdAt || Date.now()).getTime() / 1000);
        html += `        <DT><A HREF="${tabUrl}" ADD_DATE="${tabDate}">${tabTitle}</A>\n`;
      }
      html += `    </DL><p>\n`;
    }
    html += `</DL><p>\n`;
    return html;
  } else if (format === 'csv') {
    const rows = ['"Session Group","Title","URL","Domain","Tags","Saved Date"'];
    for (const session of targetSessions) {
      const groupName = session.title || 'Untitled Session';
      const tagsStr = (session.tags || []).join('; ');
      for (const tab of session.tabs) {
        const title = (tab.title || '').replace(/"/g, '""');
        const url = (tab.url || '').replace(/"/g, '""');
        const domain = (tab.domain || extractDomain(tab.url)).replace(/"/g, '""');
        const dateStr = session.createdAt ? new Date(session.createdAt).toISOString() : '';
        rows.push(`"${groupName.replace(/"/g, '""')}","${title}","${url}","${domain}","${tagsStr.replace(/"/g, '""')}","${dateStr}"`);
      }
    }
    return rows.join('\r\n');
  }
  return '';
}

function updateExportPreview() {
  const format = document.getElementById('export-format-select').value;
  const scope = document.getElementById('export-scope-select').value;
  const previewArea = document.getElementById('export-preview-area');
  previewArea.value = generateExportContent(format, scope);
}

function populateExportScopeDropdown() {
  const select = document.getElementById('export-scope-select');
  select.innerHTML = '<option value="all">All Sessions</option>';
  sessionsState.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.title} (${s.tabs.length} tabs)`;
    select.appendChild(opt);
  });
}

function openExportForSession(session) {
  populateExportScopeDropdown();
  document.getElementById('export-scope-select').value = session.id;
  updateExportPreview();
  openModal('modal-import-export');
  switchModalTab('tab-export-docs');
}

// ==========================================================================
// JSON Backup & File Upload Restore
// ==========================================================================
function handleDownloadJson() {
  const payload = {
    app: 'TabVault',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    sessionCount: sessionsState.length,
    tabCount: sessionsState.reduce((acc, s) => acc + s.tabs.length, 0),
    sessions: sessionsState
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const dateStamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  a.href = url;
  a.download = `tabvault_backup_${dateStamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleJsonFileRestore() {
  const fileInput = document.getElementById('json-file-input');
  const statusMsg = document.getElementById('json-status-msg');
  const mode = document.querySelector('input[name="json-restore-mode"]:checked').value;

  if (!fileInput.files || fileInput.files.length === 0) {
    statusMsg.textContent = 'Please select a .json backup file first.';
    statusMsg.style.color = '#EF4444';
    return;
  }

  const file = fileInput.files[0];
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data || !Array.isArray(data.sessions)) {
      throw new Error('Invalid JSON backup: missing "sessions" array.');
    }

    const validated = data.sessions.map(validateSession);
    let finalSessions = [];

    if (mode === 'replace') {
      finalSessions = validated;
    } else {
      const existing = await getSessions();
      const existingIds = new Set(existing.map(s => s.id));
      const newItems = validated.filter(s => !existingIds.has(s.id));
      finalSessions = [...newItems, ...existing];
    }

    await saveSessions(finalSessions);
    await loadSessions();

    statusMsg.textContent = `Successfully restored ${validated.length} session${validated.length === 1 ? '' : 's'}!`;
    statusMsg.style.color = '#10B981';
    fileInput.value = '';
  } catch (err) {
    statusMsg.textContent = `Restore failed: ${err.message}`;
    statusMsg.style.color = '#EF4444';
    fileInput.value = '';
  }
}

// ==========================================================================
// Cloud Sync Integration
// ==========================================================================
async function handleCloudBackupNow() {
  const statusMsg = document.getElementById('cloud-modal-status');
  const syncBtn = document.getElementById('btn-sync-now');
  syncBtn.disabled = true;
  statusMsg.textContent = 'Connecting to Google Drive...';
  statusMsg.style.color = '#6366F1';

  try {
    const res = await backupToGoogleDrive(true);
    statusMsg.textContent = `Backup completed! (${res.tabCount} tabs backed up)`;
    statusMsg.style.color = '#10B981';
    await loadSettings();
    showToast('Google Drive cloud backup created successfully!');
  } catch (err) {
    console.error(err);
    statusMsg.textContent = `Backup error: ${err.message}`;
    statusMsg.style.color = '#EF4444';
  } finally {
    syncBtn.disabled = false;
  }
}

async function handleListCloudBackups() {
  const container = document.getElementById('cloud-backups-container');
  const list = document.getElementById('cloud-backups-list');
  const statusMsg = document.getElementById('cloud-modal-status');

  statusMsg.textContent = 'Fetching snapshots from Google Drive...';
  list.innerHTML = '';
  container.classList.remove('hidden');

  try {
    const files = await listGoogleDriveBackups(true);
    if (files.length === 0) {
      list.innerHTML = '<li class="cloud-backup-item">No snapshots found in Google Drive yet.</li>';
      statusMsg.textContent = '';
      return;
    }

    statusMsg.textContent = `Found ${files.length} backup snapshot(s).`;
    statusMsg.style.color = '#10B981';

    files.forEach(file => {
      const li = document.createElement('li');
      li.className = 'cloud-backup-item';

      const d = new Date(file.modifiedTime || file.createdTime).toLocaleString();
      const sizeKb = file.size ? Math.round(file.size / 1024) : 0;

      const infoDiv = document.createElement('div');
      const nameStrong = document.createElement('strong');
      nameStrong.textContent = file.name || 'Untitled Backup';
      const subDiv = document.createElement('div');
      subDiv.style.fontSize = '0.75rem';
      subDiv.style.color = 'var(--text-muted)';
      subDiv.textContent = `${d} • ${sizeKb} KB`;
      infoDiv.appendChild(nameStrong);
      infoDiv.appendChild(subDiv);
      li.appendChild(infoDiv);

      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'btn btn-secondary btn-sm';
      restoreBtn.textContent = 'Restore';
      restoreBtn.addEventListener('click', async () => {
        restoreBtn.disabled = true;
        restoreBtn.textContent = 'Restoring...';
        try {
          const res = await restoreFromGoogleDrive(file.id, 'merge', true);
          await loadSessions();
          showToast(`Restored ${res.restoredCount} sessions from Google Drive!`);
          closeModal('modal-cloud-sync');
        } catch (rErr) {
          alert(`Restore failed: ${rErr.message}`);
        } finally {
          restoreBtn.disabled = false;
          restoreBtn.textContent = 'Restore';
        }
      });

      li.appendChild(restoreBtn);
      list.appendChild(li);
    });
  } catch (err) {
    statusMsg.textContent = `Could not list backups: ${err.message}`;
    statusMsg.style.color = '#EF4444';
  }
}

// ==========================================================================
// Settings Form & Modal Handlers
// ==========================================================================
function populateSettingsForm() {
  document.getElementById('setting-click-action').value = settingsState.clickAction || 'open_dashboard';
  document.getElementById('setting-theme').value = settingsState.theme || 'dark';
  document.getElementById('toggle-new-window').checked = Boolean(settingsState.openInNewWindow);
  document.getElementById('toggle-remove-restore').checked = Boolean(settingsState.removeOnRestore);
  document.getElementById('toggle-preserve-pinned').checked = Boolean(settingsState.preservePinnedTabs);
  document.getElementById('toggle-dedup').checked = Boolean(settingsState.deduplicateTabs);

  // Cloud Sync form
  document.getElementById('toggle-auto-sync').checked = Boolean(settingsState.autoSyncDrive);
  document.getElementById('select-sync-target').value = settingsState.syncTarget || 'appDataFolder';
  document.getElementById('input-custom-client-id').value = settingsState.customClientId || '';

  // Tab threshold & memory alert
  const tabAlertToggle = document.getElementById('toggle-tab-alert');
  if (tabAlertToggle) tabAlertToggle.checked = Boolean(settingsState.tabThresholdAlert);
  const tabLimitInput = document.getElementById('input-tab-limit');
  if (tabLimitInput) tabLimitInput.value = settingsState.tabThresholdLimit || 15;
}

async function bindSettingsChangeHandlers() {
  const clickAction = document.getElementById('setting-click-action');
  clickAction.addEventListener('change', async () => {
    await saveSettings({ clickAction: clickAction.value });
    await loadSettings();
  });

  const themeSelect = document.getElementById('setting-theme');
  themeSelect.addEventListener('change', async () => {
    await saveSettings({ theme: themeSelect.value });
    await loadSettings();
  });

  const newWindowToggle = document.getElementById('toggle-new-window');
  newWindowToggle.addEventListener('change', async () => {
    await saveSettings({ openInNewWindow: newWindowToggle.checked });
    await loadSettings();
  });

  const removeRestoreToggle = document.getElementById('toggle-remove-restore');
  removeRestoreToggle.addEventListener('change', async () => {
    await saveSettings({ removeOnRestore: removeRestoreToggle.checked });
    await loadSettings();
  });

  const preservePinnedToggle = document.getElementById('toggle-preserve-pinned');
  preservePinnedToggle.addEventListener('change', async () => {
    await saveSettings({ preservePinnedTabs: preservePinnedToggle.checked });
    await loadSettings();
  });

  const dedupToggle = document.getElementById('toggle-dedup');
  dedupToggle.addEventListener('change', async () => {
    await saveSettings({ deduplicateTabs: dedupToggle.checked });
    await loadSettings();
  });

  const tabAlertToggle = document.getElementById('toggle-tab-alert');
  if (tabAlertToggle) {
    tabAlertToggle.addEventListener('change', async () => {
      await saveSettings({ tabThresholdAlert: tabAlertToggle.checked });
      await loadSettings();
    });
  }

  const tabLimitInput = document.getElementById('input-tab-limit');
  if (tabLimitInput) {
    tabLimitInput.addEventListener('change', async () => {
      const val = parseInt(tabLimitInput.value, 10);
      if (!isNaN(val) && val >= 5) {
        await saveSettings({ tabThresholdLimit: val });
        await loadSettings();
      }
    });
  }

  // Cloud form handlers
  const autoSyncToggle = document.getElementById('toggle-auto-sync');
  autoSyncToggle.addEventListener('change', async () => {
    await saveSettings({ autoSyncDrive: autoSyncToggle.checked });
    await loadSettings();
  });

  const syncTargetSelect = document.getElementById('select-sync-target');
  syncTargetSelect.addEventListener('change', async () => {
    await saveSettings({ syncTarget: syncTargetSelect.value });
    await loadSettings();
  });

  const customClientIdInput = document.getElementById('input-custom-client-id');
  customClientIdInput.addEventListener('change', async () => {
    await saveSettings({ customClientId: customClientIdInput.value.trim() });
    await loadSettings();
  });

  // Clear all data
  document.getElementById('btn-clear-all-data').addEventListener('click', async () => {
    const confirmMsg = 'Are you sure you want to delete ALL saved sessions? This cannot be undone.';
    if (confirm(confirmMsg)) {
      await saveSessions([]);
      await loadSessions();
      closeModal('modal-settings');
      showToast('All sessions cleared.');
    }
  });
}

// ==========================================================================
// Modal Helpers
// ==========================================================================
function resetImportExportForm() {
  const fileInput = document.getElementById('json-file-input');
  const jsonStatus = document.getElementById('json-status-msg');
  if (fileInput) fileInput.value = '';
  if (jsonStatus) jsonStatus.textContent = '';
  const onetabStatus = document.getElementById('onetab-import-status');
  if (onetabStatus) onetabStatus.textContent = '';
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    if (modalId === 'modal-import-export') {
      resetImportExportForm();
    }
    modal.classList.remove('hidden');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    if (modalId === 'modal-import-export') {
      resetImportExportForm();
    }
    modal.classList.add('hidden');
  }
}

function switchModalTab(targetTabId) {
  const tabs = document.querySelectorAll('.modal-tab');
  const panes = document.querySelectorAll('.tab-pane');

  tabs.forEach(t => {
    t.classList.toggle('active', t.dataset.tab === targetTabId);
  });

  panes.forEach(p => {
    p.classList.toggle('active', p.id === targetTabId);
  });

  if (targetTabId === 'tab-json') {
    resetImportExportForm();
  }
}

function setupModalHandlers() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(btn.dataset.closeModal);
    });
  });

  // Close modal when clicking on overlay background
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });

  // Tab switching in import/export modal
  document.querySelectorAll('.modal-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      switchModalTab(tabBtn.dataset.tab);
    });
  });

  bindSettingsChangeHandlers();
}

function openAddTabModal(sessionId) {
  document.getElementById('add-tab-session-id').value = sessionId;
  document.getElementById('add-tab-url').value = '';
  document.getElementById('add-tab-title').value = '';
  openModal('modal-add-tab');
}

// ==========================================================================
// Global Event Listeners & Shortcuts
// ==========================================================================
function setupEventListeners() {
  // Top Header Actions
  document.getElementById('btn-collapse-window').addEventListener('click', async () => {
    chrome.runtime.sendMessage({ type: 'COLLAPSE_WINDOW' });
  });

  document.getElementById('btn-new-group').addEventListener('click', async () => {
    const dummy = [{ url: 'https://google.com', title: 'Google' }];
    await createSession(dummy, 'New Group');
    await loadSessions();
  });

  document.getElementById('btn-import-export').addEventListener('click', () => {
    populateExportScopeDropdown();
    updateExportPreview();
    openModal('modal-import-export');
  });

  document.getElementById('btn-cloud-sync').addEventListener('click', () => {
    openModal('modal-cloud-sync');
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    updateStorageMeter();
    openModal('modal-settings');
  });

  // Search input & clear
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    searchClear.classList.toggle('hidden', !searchQuery);
    renderDashboard();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClear.classList.add('hidden');
    searchInput.focus();
    renderDashboard();
  });

  // Sort & Filter selects
  sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    renderDashboard();
  });

  filterSelect.addEventListener('change', () => {
    currentFilter = filterSelect.value;
    renderDashboard();
  });

  // Clean Duplicates across all sessions
  btnDedupAll.addEventListener('click', async () => {
    let totalRemoved = 0;
    for (const session of sessionsState) {
      const count = await deduplicateSession(session.id);
      totalRemoved += count;
    }
    await loadSessions();
    showToast(`Removed ${totalRemoved} duplicate tabs.`);
  });

  // Empty state buttons
  document.getElementById('btn-empty-collapse').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'COLLAPSE_WINDOW' });
  });

  document.getElementById('btn-empty-import').addEventListener('click', () => {
    openModal('modal-import-export');
    switchModalTab('tab-onetab');
  });

  // Undo button in toast
  toastUndoBtn.addEventListener('click', async () => {
    if (undoItem) {
      await undoItem();
      hideToast();
    }
  });

  // OneTab Import button
  document.getElementById('btn-parse-onetab').addEventListener('click', handleOneTabImport);

  // Notion / Markdown export controls
  document.getElementById('export-format-select').addEventListener('change', updateExportPreview);
  document.getElementById('export-scope-select').addEventListener('change', updateExportPreview);

  document.getElementById('btn-copy-export').addEventListener('click', async () => {
    const text = document.getElementById('export-preview-area').value;
    await navigator.clipboard.writeText(text);
    const status = document.getElementById('export-status-msg');
    status.textContent = 'Copied to clipboard!';
    setTimeout(() => { status.textContent = ''; }, 3000);
  });

  const btnDownloadExport = document.getElementById('btn-download-export') || document.getElementById('btn-download-md');
  if (btnDownloadExport) {
    btnDownloadExport.addEventListener('click', () => {
      const text = document.getElementById('export-preview-area').value;
      const format = document.getElementById('export-format-select').value;
      let mimeType = 'text/plain;charset=utf-8';
      let ext = 'txt';
      if (format === 'markdown-list' || format === 'markdown-table') {
        mimeType = 'text/markdown;charset=utf-8';
        ext = 'md';
      } else if (format === 'bookmarks-html') {
        mimeType = 'text/html;charset=utf-8';
        ext = 'html';
      } else if (format === 'csv') {
        mimeType = 'text/csv;charset=utf-8';
        ext = 'csv';
      }
      const blob = new Blob([text], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tabvault_export_${new Date().toISOString().slice(0, 10)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // JSON download & restore buttons
  document.getElementById('btn-download-json').addEventListener('click', handleDownloadJson);
  document.getElementById('btn-trigger-json-restore').addEventListener('click', handleJsonFileRestore);

  // Cloud Sync buttons
  document.getElementById('btn-sync-now').addEventListener('click', handleCloudBackupNow);
  document.getElementById('btn-list-cloud-backups').addEventListener('click', handleListCloudBackups);

  // Add custom URL modal action
  document.getElementById('btn-confirm-add-tab').addEventListener('click', async () => {
    const sessionId = document.getElementById('add-tab-session-id').value;
    const url = document.getElementById('add-tab-url').value.trim();
    const title = document.getElementById('add-tab-title').value.trim();

    if (!url) return;

    try {
      const valid = validateTab({ url, title });
      await restoreTabToSession(sessionId, valid, 0);
      closeModal('modal-add-tab');
      await loadSessions();
      showToast('Tab added to group.');
    } catch (err) {
      alert(`Invalid tab: ${err.message}`);
    }
  });
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // Focus search with '/' when not already inside an input/textarea
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      searchInput.focus();
    }

    // Close modals on Escape
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.add('hidden');
      });
    }
  });
}

// Listen for background storage changes (e.g. tabs collapsed from toolbar icon or shortcut)
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.tabvault_sessions || changes.tabvault_settings) {
        loadSessions();
        loadSettings();
      }
    }
  });
}

