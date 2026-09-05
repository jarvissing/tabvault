// storage-manager.js
// Production-grade storage and schema validation engine for TabVault.
// Provides atomic updates, deduplication, crash recovery staging, and memory metrics.

export const STORAGE_KEYS = {
  SESSIONS: 'tabvault_sessions',
  SETTINGS: 'tabvault_settings',
  STAGING: 'tabvault_staging_active_tabs',
  BACKUP_META: 'tabvault_backup_meta',
  UNDO_STACK: 'tabvault_undo_stack'
};

export const DEFAULT_SETTINGS = {
  clickAction: 'collapse_window', // 'collapse_window' | 'open_dashboard'
  openInNewWindow: false,        // Restore all tabs in a brand-new window
  removeOnRestore: true,         // Remove tab from vault when restored
  preservePinnedTabs: true,      // Don't close pinned tabs when collapsing
  deduplicateTabs: true,         // Ignore identical URLs within the same session
  autoSyncDrive: false,          // Automated 24h background sync
  syncTarget: 'appDataFolder',   // 'appDataFolder' | 'TabVault_Backups'
  theme: 'dark',                 // 'dark' | 'light' | 'system'
  lastCloudBackup: null,
  driveConnected: false,
  customClientId: '',            // Optional user-specified Google OAuth Client ID
  tabThresholdAlert: false,      // Memory pressure alert when open tabs exceed limit
  tabThresholdLimit: 15,         // Configurable tab count limit
  customTags: ['Work', 'Personal', 'Dev', 'Reading', 'Finance']
};

/**
 * Generate a cryptographically robust unique identifier
 */
export function generateId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Extract clean domain name from URL
 */
export function extractDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
}

/**
 * Validate and sanitize an individual Tab object
 */
export function validateTab(tab) {
  if (!tab || typeof tab !== 'object') {
    throw new Error('Invalid tab object');
  }

  const rawUrl = String(tab.url || '').trim();
  const lowerUrl = rawUrl.toLowerCase();
  if (!rawUrl || 
      lowerUrl.startsWith('javascript:') || 
      lowerUrl.startsWith('data:') || 
      lowerUrl.startsWith('vbscript:') || 
      lowerUrl.startsWith('file:')) {
    throw new Error('Unsafe or invalid URL provided');
  }

  const domain = extractDomain(rawUrl);
  const title = String(tab.title || domain || rawUrl).trim().slice(0, 500);
  const time = typeof tab.createdAt === 'number' ? tab.createdAt : (typeof tab.timestamp === 'number' ? tab.timestamp : Date.now());

  return {
    id: String(tab.id || generateId('tab')),
    url: rawUrl,
    title: title || 'Untitled Tab',
    favIconUrl: tab.favIconUrl && typeof tab.favIconUrl === 'string' && tab.favIconUrl.startsWith('http') ? tab.favIconUrl : null,
    domain: domain,
    pinned: Boolean(tab.pinned),
    timestamp: time,
    createdAt: time
  };
}

/**
 * Validate and sanitize a Session Group object
 */
export function validateSession(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('Invalid session object');
  }

  const tabs = Array.isArray(session.tabs) 
    ? session.tabs.map(t => {
        try {
          return validateTab(t);
        } catch {
          return null;
        }
      }).filter(Boolean)
    : [];

  const createdAt = typeof session.createdAt === 'number' ? session.createdAt : Date.now();
  const dateFormatted = new Date(createdAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const tags = Array.isArray(session.tags)
    ? [...new Set(session.tags.map(t => String(t).replace(/[<>'"]/g, '').trim().slice(0, 30)))].filter(Boolean)
    : [];

  return {
    id: String(session.id || generateId('session')),
    title: String(session.title || `Session — ${dateFormatted}`).trim().slice(0, 200),
    createdAt: createdAt,
    updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : Date.now(),
    locked: Boolean(session.locked),
    pinned: Boolean(session.pinned),
    color: typeof session.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(session.color) ? session.color : '#6366F1',
    tags: tags,
    tabs: tabs
  };
}

/**
 * Fetch all sessions from chrome.storage.local
 */
export async function getSessions() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.SESSIONS);
    const rawSessions = data[STORAGE_KEYS.SESSIONS];
    if (!Array.isArray(rawSessions)) {
      return [];
    }
    return rawSessions.map(s => {
      try {
        return validateSession(s);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (err) {
    console.error('[TabVault Storage] Error fetching sessions:', err);
    return [];
  }
}

/**
 * Atomically save sessions to storage
 */
export async function saveSessions(sessions) {
  if (!Array.isArray(sessions)) {
    throw new Error('Sessions must be an array');
  }

  const validated = sessions.map(validateSession);
  await chrome.storage.local.set({ [STORAGE_KEYS.SESSIONS]: validated });
  await updateBadgeCount(validated);
  return validated;
}

/**
 * Update extension action badge count
 */
export async function updateBadgeCount(sessions = null) {
  try {
    if (!chrome.action || !chrome.action.setBadgeText) return;
    
    if (!sessions) {
      sessions = await getSessions();
    }
    
    const totalTabs = sessions.reduce((acc, s) => acc + (s.tabs?.length || 0), 0);
    const text = totalTabs > 0 ? (totalTabs > 999 ? '999+' : String(totalTabs)) : '';
    
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: '#4F46E5' });
  } catch (err) {
    // Non-fatal error during badge update
    console.warn('[TabVault] Failed to update badge count:', err);
  }
}

/**
 * Fetch user settings with safe fallback to defaults
 */
export async function getSettings() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return { ...DEFAULT_SETTINGS, ...(data[STORAGE_KEYS.SETTINGS] || {}) };
  } catch (err) {
    console.error('[TabVault Storage] Error reading settings:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save updated user settings
 */
export async function saveSettings(newSettings) {
  try {
    const current = await getSettings();
    const merged = { ...current, ...newSettings };
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged });
    return merged;
  } catch (err) {
    console.error('[TabVault Storage] Error saving settings:', err);
    throw err;
  }
}

/**
 * Create a new session group and prepend to storage
 */
export async function createSession(rawTabs, customTitle = '', customColor = '#6366F1') {
  if (!Array.isArray(rawTabs) || rawTabs.length === 0) {
    throw new Error('No tabs to create session');
  }

  const settings = await getSettings();
  const validTabs = [];
  const seenUrls = new Set();

  for (const raw of rawTabs) {
    try {
      const tab = validateTab(raw);
      if (settings.deduplicateTabs) {
        if (seenUrls.has(tab.url)) continue;
        seenUrls.add(tab.url);
      }
      validTabs.push(tab);
    } catch {
      // Ignore invalid tabs
    }
  }

  if (validTabs.length === 0) {
    throw new Error('No valid web tabs found in window');
  }

  const now = Date.now();
  const dateFormatted = new Date(now).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const session = {
    id: generateId('session'),
    title: customTitle.trim() || `Session — ${dateFormatted}`,
    createdAt: now,
    updatedAt: now,
    locked: false,
    pinned: false,
    color: customColor,
    tabs: validTabs
  };

  const sessions = await getSessions();
  // New sessions are prepended so the latest appears at the top
  sessions.unshift(session);
  await saveSessions(sessions);

  // Clear staging active tabs after successful collapse
  await clearCrashRecoveryStaging();

  return session;
}

/**
 * Update an existing session's properties
 */
export async function updateSession(sessionId, updates) {
  const sessions = await getSessions();
  const index = sessions.findIndex(s => s.id === sessionId);
  if (index === -1) {
    throw new Error(`Session ${sessionId} not found`);
  }

  const current = sessions[index];
  const updated = validateSession({
    ...current,
    ...updates,
    updatedAt: Date.now()
  });

  sessions[index] = updated;
  await saveSessions(sessions);
  return updated;
}

/**
 * Add a tag label to a session
 */
export async function addTagToSession(sessionId, tag) {
  const clean = String(tag || '').trim().replace(/^#/, '').slice(0, 30);
  if (!clean) return;
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return;
  if (!Array.isArray(session.tags)) session.tags = [];
  if (!session.tags.includes(clean)) {
    session.tags.push(clean);
    session.updatedAt = Date.now();
    await saveSessions(sessions);
  }
  return session;
}

/**
 * Remove a tag label from a session
 */
export async function removeTagFromSession(sessionId, tag) {
  const clean = String(tag || '').trim().replace(/^#/, '');
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session || !Array.isArray(session.tags)) return;
  session.tags = session.tags.filter(t => t !== clean);
  session.updatedAt = Date.now();
  await saveSessions(sessions);
  return session;
}

/**
 * Delete an entire session with lock safeguard
 */
export async function deleteSession(sessionId, force = false) {
  const sessions = await getSessions();
  const index = sessions.findIndex(s => s.id === sessionId);
  if (index === -1) {
    return null;
  }

  const session = sessions[index];
  if (session.locked && !force) {
    throw new Error('This session is locked. Unlock it before deleting.');
  }

  sessions.splice(index, 1);
  await saveSessions(sessions);
  return session; // Returns deleted session for Undo support
}

/**
 * Delete a single tab from a session
 */
export async function deleteTab(sessionId, tabId) {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return null;

  const tabIndex = session.tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return null;

  const [removedTab] = session.tabs.splice(tabIndex, 1);
  session.updatedAt = Date.now();

  // If the session has no more tabs, remove the session as well
  if (session.tabs.length === 0 && !session.locked) {
    const sIndex = sessions.findIndex(s => s.id === sessionId);
    sessions.splice(sIndex, 1);
  }

  await saveSessions(sessions);
  return { session, removedTab, tabIndex };
}

/**
 * Restore a deleted tab back into a session (Undo action)
 */
export async function restoreTabToSession(sessionId, tab, targetIndex = 0) {
  const sessions = await getSessions();
  let session = sessions.find(s => s.id === sessionId);

  if (!session) {
    // If session was also removed, recreate it
    session = validateSession({
      id: sessionId,
      title: 'Restored Session',
      createdAt: Date.now(),
      tabs: []
    });
    sessions.unshift(session);
  }

  const validTab = validateTab(tab);
  session.tabs.splice(Math.max(0, Math.min(targetIndex, session.tabs.length)), 0, validTab);
  session.updatedAt = Date.now();

  await saveSessions(sessions);
  return session;
}

/**
 * Reorder tabs within a session (Drag & Drop)
 */
export async function reorderTabs(sessionId, sourceIndex, targetIndex) {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session || sourceIndex < 0 || sourceIndex >= session.tabs.length) {
    return;
  }

  const [moved] = session.tabs.splice(sourceIndex, 1);
  session.tabs.splice(Math.max(0, Math.min(targetIndex, session.tabs.length)), 0, moved);
  session.updatedAt = Date.now();
  await saveSessions(sessions);
}

/**
 * Move a tab from one session to another
 */
export async function moveTabAcrossSessions(sourceSessionId, targetSessionId, tabId, targetIndex = 0) {
  const sessions = await getSessions();
  const sourceSession = sessions.find(s => s.id === sourceSessionId);
  const targetSession = sessions.find(s => s.id === targetSessionId);

  if (!sourceSession || !targetSession) return;

  const tabIdx = sourceSession.tabs.findIndex(t => t.id === tabId);
  if (tabIdx === -1) return;

  const [tab] = sourceSession.tabs.splice(tabIdx, 1);
  sourceSession.updatedAt = Date.now();

  targetSession.tabs.splice(Math.max(0, Math.min(targetIndex, targetSession.tabs.length)), 0, tab);
  targetSession.updatedAt = Date.now();

  if (sourceSession.tabs.length === 0 && !sourceSession.locked) {
    const sIdx = sessions.findIndex(s => s.id === sourceSessionId);
    sessions.splice(sIdx, 1);
  }

  await saveSessions(sessions);
}

/**
 * Remove duplicates within a session or across all sessions
 */
export async function deduplicateSession(sessionId) {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return 0;

  const seen = new Set();
  const originalCount = session.tabs.length;
  session.tabs = session.tabs.filter(tab => {
    if (seen.has(tab.url)) return false;
    seen.add(tab.url);
    return true;
  });

  session.updatedAt = Date.now();
  await saveSessions(sessions);
  return originalCount - session.tabs.length;
}

/**
 * Calculate system metrics and storage health
 */
export async function getStorageStats() {
  const sessions = await getSessions();
  const totalTabs = sessions.reduce((acc, s) => acc + s.tabs.length, 0);
  const totalSessions = sessions.length;

  // Approximate memory saved: Average Chromium tab consumes ~150 MB of RAM
  const estimatedRamSavedMb = totalTabs * 150;
  const ramDisplay = estimatedRamSavedMb >= 1024
    ? `${(estimatedRamSavedMb / 1024).toFixed(1)} GB`
    : `${estimatedRamSavedMb} MB`;

  let bytesInUse = 0;
  try {
    if (chrome.storage.local.getBytesInUse) {
      bytesInUse = await chrome.storage.local.getBytesInUse();
    } else {
      const allData = await chrome.storage.local.get(null);
      bytesInUse = new Blob([JSON.stringify(allData)]).size;
    }
  } catch {
    bytesInUse = 0;
  }

  const bytesDisplay = bytesInUse > 1024 * 1024
    ? `${(bytesInUse / (1024 * 1024)).toFixed(2)} MB`
    : `${(bytesInUse / 1024).toFixed(1)} KB`;

  return {
    totalTabs,
    totalSessions,
    estimatedRamSavedMb,
    ramDisplay,
    bytesInUse,
    bytesDisplay
  };
}

/**
 * Crash Recovery Staging
 */
export async function stageActiveTabs(tabs) {
  try {
    const valid = tabs.map(t => ({
      url: t.url,
      title: t.title,
      pinned: t.pinned,
      favIconUrl: t.favIconUrl
    }));
    await chrome.storage.local.set({ [STORAGE_KEYS.STAGING]: { timestamp: Date.now(), tabs: valid } });
  } catch (err) {
    console.warn('[TabVault] Failed to stage active tabs:', err);
  }
}

export async function getCrashRecoveryStaging() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.STAGING);
    return data[STORAGE_KEYS.STAGING] || null;
  } catch {
    return null;
  }
}

export async function clearCrashRecoveryStaging() {
  try {
    await chrome.storage.local.remove(STORAGE_KEYS.STAGING);
  } catch (err) {
    console.warn('[TabVault] Failed to clear staging:', err);
  }
}
