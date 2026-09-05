// background.js
// Manifest V3 Service Worker for TabVault
// Handles tab capture, keyboard commands, context menus, automated alarms, and badge updates.

import {
  createSession,
  getSessions,
  getSettings,
  updateBadgeCount,
  stageActiveTabs,
  getCrashRecoveryStaging,
  STORAGE_KEYS
} from './storage-manager.js';
import { backupToGoogleDrive } from './cloud-sync.js';

function getDashboardUrl() {
  return chrome.runtime.getURL('dashboard.html');
}

/**
 * Filter out system, browser internal, extension, and blank pages
 */
function isSavableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase().trim();
  if (lower === '' || lower === 'about:blank') return false;
  if (lower.startsWith('chrome://') || lower.startsWith('chrome-extension://')) return false;
  if (lower.startsWith('edge://') || lower.startsWith('devtools://')) return false;
  if (lower.startsWith('brave://') || lower.startsWith('opera://') || lower.startsWith('vivaldi://')) return false;
  if (lower.startsWith('view-source:')) return false;
  if (lower.includes('dashboard.html')) return false;
  return true;
}

/**
 * Open or switch to the TabVault Dashboard tab
 */
async function openOrFocusDashboard(targetWindowId = null) {
  try {
    const dashboardUrl = getDashboardUrl();
    const tabs = await chrome.tabs.query({});
    const existingTab = tabs.find(t => t.url && t.url.toLowerCase().includes('dashboard.html'));

    if (existingTab) {
      await chrome.tabs.update(existingTab.id, { active: true });
      if (existingTab.windowId) {
        try {
          await chrome.windows.update(existingTab.windowId, { focused: true });
        } catch {
          // ignore window focus error
        }
      }
      return existingTab;
    }

    try {
      const createParams = { url: dashboardUrl, active: true };
      if (targetWindowId) {
        createParams.windowId = targetWindowId;
      }
      return await chrome.tabs.create(createParams);
    } catch {
      return await chrome.tabs.create({ url: dashboardUrl, active: true });
    }
  } catch (err) {
    console.error('[TabVault] Error in openOrFocusDashboard:', err);
  }
}

/**
 * Monitor open tabs count and warn if memory pressure threshold is exceeded
 */
export async function checkTabMemoryPressure() {
  try {
    const settings = await getSettings();
    if (!settings.tabThresholdAlert) {
      if (chrome.action && chrome.action.setTitle) {
        await chrome.action.setTitle({ title: 'TabVault - Zero-Data-Loss Tab Manager' });
      }
      await updateBadgeCount();
      return;
    }

    const tabs = await chrome.tabs.query({ currentWindow: true });
    const count = tabs ? tabs.length : 0;
    const limit = Number(settings.tabThresholdLimit) || 15;

    if (count >= limit) {
      const estRamMb = count * 150;
      await chrome.action.setBadgeText({ text: `${count}!` });
      await chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' }); // Warning Amber
      if (chrome.action && chrome.action.setTitle) {
        await chrome.action.setTitle({
          title: `TabVault Alert: ${count} open tabs (~${estRamMb} MB RAM). Click or press Ctrl+Shift+K to free memory!`
        });
      }
    } else {
      if (chrome.action && chrome.action.setTitle) {
        await chrome.action.setTitle({ title: 'TabVault - Zero-Data-Loss Tab Manager' });
      }
      await updateBadgeCount();
    }
  } catch (err) {
    console.warn('[TabVault] Check tab memory pressure warning:', err);
  }
}

/**
 * Flash extension badge with feedback text
 */
async function flashBadge(text = '✓', durationMs = 1500) {
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: '#10B981' }); // Emerald green

    setTimeout(async () => {
      await checkTabMemoryPressure();
    }, durationMs);
  } catch (err) {
    console.warn('[TabVault] Flash badge warning:', err);
  }
}

/**
 * Collapse all open eligible tabs in active window into a new TabVault session
 */
async function collapseActiveWindow(targetWindowId = null) {
  try {
    let windowId = targetWindowId;
    if (!windowId) {
      const lastWin = await chrome.windows.getLastFocused();
      windowId = lastWin?.id;
    }

    // Query tabs specifically in this target window
    const queryOpts = windowId ? { windowId } : { currentWindow: true };
    const allTabs = await chrome.tabs.query(queryOpts);

    if (!allTabs || allTabs.length === 0) {
      console.log('[TabVault] No tabs found in window', windowId);
      await openOrFocusDashboard(windowId);
      return;
    }

    const settings = await getSettings();

    // Filter tabs to save (ignoring browser internal tabs and pinned tabs if configured)
    const tabsToSave = allTabs.filter(tab => {
      const url = tab.url || tab.pendingUrl;
      if (!isSavableUrl(url)) return false;
      if (settings.preservePinnedTabs && tab.pinned) return false;
      return true;
    });

    console.log(`[TabVault] Window ${windowId}: ${allTabs.length} tabs total, ${tabsToSave.length} savable.`);

    if (tabsToSave.length === 0) {
      // If no eligible tabs to collapse (e.g. only settings or dashboard open), open dashboard
      await openOrFocusDashboard(windowId);
      return;
    }

    // Stage active tabs for crash recovery before closing
    await stageActiveTabs(tabsToSave);

    // Group and save tabs into a new session
    await createSession(tabsToSave);

    // Open dashboard in THIS WINDOW FIRST using full chrome.runtime.getURL!
    const dashboardUrl = getDashboardUrl();
    try {
      const createParams = { url: dashboardUrl, active: true };
      if (windowId) {
        createParams.windowId = windowId;
      }
      await chrome.tabs.create(createParams);
    } catch {
      await chrome.tabs.create({ url: dashboardUrl, active: true });
    }

    // Close the collapsed tabs
    const tabIdsToClose = tabsToSave.map(t => t.id).filter(id => typeof id === 'number');
    if (tabIdsToClose.length > 0) {
      await chrome.tabs.remove(tabIdsToClose);
    }

    await flashBadge('SAVED');

    // Trigger automated Google Drive cloud backup if enabled
    if (settings.autoSyncDrive) {
      try {
        await backupToGoogleDrive(false);
      } catch (syncErr) {
        console.warn('[TabVault] Auto sync after collapse deferred:', syncErr);
      }
    }
  } catch (err) {
    console.error('[TabVault] Error in collapseActiveWindow:', err);
    await openOrFocusDashboard(targetWindowId);
  }
}

/**
 * Save the currently active tab into TabVault
 */
async function saveActiveTab() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !isSavableUrl(activeTab.url)) {
      return;
    }

    const now = Date.now();
    const dateStr = new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    await createSession([activeTab], `Quick Save — ${dateStr}`);

    await flashBadge('+1');

    const windowTabs = await chrome.tabs.query({ currentWindow: true });
    if (windowTabs.length > 1) {
      await chrome.tabs.remove(activeTab.id);
    } else {
      await openOrFocusDashboard(activeTab.windowId);
      await chrome.tabs.remove(activeTab.id);
    }
  } catch (err) {
    console.error('[TabVault] Error saving active tab:', err);
  }
}

// ---------------------------------------------------------------------------
// Action Icon Click Handling
// ---------------------------------------------------------------------------
chrome.action.onClicked.addListener(async (tab) => {
  try {
    const settings = await getSettings();
    const windowId = tab?.windowId;

    if (settings?.clickAction === 'open_dashboard') {
      await openOrFocusDashboard(windowId);
    } else {
      // Default: collapse active window (OneTab style)
      // If no savable tabs, collapseActiveWindow opens dashboard automatically
      await collapseActiveWindow(windowId);
    }
  } catch (err) {
    console.error('[TabVault] Action click error:', err);
    await openOrFocusDashboard(tab?.windowId);
  }
});

// ---------------------------------------------------------------------------
// Keyboard Commands Handling
// ---------------------------------------------------------------------------
chrome.commands.onCommand.addListener(async (command) => {
  switch (command) {
    case 'collapse-current-window':
      await collapseActiveWindow();
      break;
    case 'send-current-tab':
      await saveActiveTab();
      break;
    case 'open-dashboard':
      await openOrFocusDashboard();
      break;
    default:
      console.warn('[TabVault] Unrecognized command:', command);
  }
});

// ---------------------------------------------------------------------------
// Context Menus Initialization & Handling
// ---------------------------------------------------------------------------
function setupContextMenus() {
  if (!chrome.contextMenus || !chrome.contextMenus.removeAll) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'tabvault_send_active_tab',
      title: 'Send this tab to TabVault',
      contexts: ['page', 'action']
    });

    chrome.contextMenus.create({
      id: 'tabvault_send_all_tabs',
      title: 'Send all tabs in window to TabVault',
      contexts: ['page', 'action']
    });

    chrome.contextMenus.create({
      id: 'tabvault_open_dashboard',
      title: 'Open TabVault Dashboard',
      contexts: ['action']
    });
  });
}

if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const windowId = tab?.windowId;
    if (info.menuItemId === 'tabvault_send_active_tab') {
      await saveActiveTab();
    } else if (info.menuItemId === 'tabvault_send_all_tabs') {
      await collapseActiveWindow(windowId);
    } else if (info.menuItemId === 'tabvault_open_dashboard') {
      await openOrFocusDashboard(windowId);
    }
  });
}

// ---------------------------------------------------------------------------
// Alarms & Automated Background Sync
// ---------------------------------------------------------------------------
function setupAlarms() {
  chrome.alarms.get('tabvault_daily_backup', (alarm) => {
    if (!alarm) {
      chrome.alarms.create('tabvault_daily_backup', { periodInMinutes: 1440 });
    }
  });

  chrome.alarms.get('tabvault_staging_heartbeat', (alarm) => {
    if (!alarm) {
      chrome.alarms.create('tabvault_staging_heartbeat', { periodInMinutes: 10 });
    }
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'tabvault_daily_backup') {
    const settings = await getSettings();
    if (settings.autoSyncDrive) {
      console.log('[TabVault] Executing scheduled 24h Google Drive backup...');
      try {
        await backupToGoogleDrive(false);
      } catch (err) {
        console.warn('[TabVault] Scheduled backup failed:', err);
      }
    }
  } else if (alarm.name === 'tabvault_staging_heartbeat') {
    try {
      const tabs = await chrome.tabs.query({});
      const eligible = tabs.filter(t => isSavableUrl(t.url));
      if (eligible.length > 0) {
        await stageActiveTabs(eligible);
      }
    } catch {
      // non-fatal
    }
  }
});

// ---------------------------------------------------------------------------
// Real-Time Tab Count & Memory Pressure Monitoring
// ---------------------------------------------------------------------------
if (chrome.tabs && chrome.tabs.onCreated) {
  chrome.tabs.onCreated.addListener(() => {
    checkTabMemoryPressure();
  });
}

if (chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener(() => {
    checkTabMemoryPressure();
  });
}

if (chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener(() => {
    checkTabMemoryPressure();
  });
}

if (chrome.windows && chrome.windows.onFocusChanged) {
  chrome.windows.onFocusChanged.addListener((winId) => {
    if (winId !== chrome.windows.WINDOW_ID_NONE) {
      checkTabMemoryPressure();
    }
  });
}

if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes[STORAGE_KEYS.SETTINGS] || changes[STORAGE_KEYS.SESSIONS])) {
      checkTabMemoryPressure();
    }
  });
}

// ---------------------------------------------------------------------------
// Lifecycle & Messaging Handlers
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(async (details) => {
  setupContextMenus();
  setupAlarms();
  await checkTabMemoryPressure();

  if (details.reason === 'install') {
    await openOrFocusDashboard();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  setupAlarms();
  await checkTabMemoryPressure();
});

// Handle messages from Dashboard or other extension pages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'COLLAPSE_WINDOW') {
        const windowId = sender?.tab?.windowId;
        await collapseActiveWindow(windowId);
        await checkTabMemoryPressure();
        sendResponse({ success: true });
      } else if (message.type === 'SAVE_ACTIVE_TAB') {
        await saveActiveTab();
        await checkTabMemoryPressure();
        sendResponse({ success: true });
      } else if (message.type === 'REFRESH_BADGE') {
        await checkTabMemoryPressure();
        sendResponse({ success: true });
      } else if (message.type === 'TRIGGER_CLOUD_SYNC') {
        const result = await backupToGoogleDrive(message.interactive !== false);
        sendResponse({ success: true, result });
      } else {
        sendResponse({ error: 'Unknown message type' });
      }
    } catch (err) {
      sendResponse({ error: err.message });
    }
  })();
  return true;
});
