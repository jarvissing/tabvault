// cloud-sync.js
// Production-grade Google Drive Cloud Sync Engine for TabVault (Zero-Data-Loss).
// Uses Chrome's native chrome.identity API and Google Drive REST API v3.
// Stores backups either in user's hidden appDataFolder or a visible TabVault_Backups folder.

import { getSessions, saveSessions, getSettings, saveSettings } from './storage-manager.js';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3';

/**
 * Retrieve an OAuth2 access token for Google Drive API
 */
export async function getAuthToken(interactive = true) {
  const settings = await getSettings();
  const clientId = settings?.customClientId?.trim();

  // If a custom OAuth Client ID was provided in Settings, use standard Web Auth Flow
  if (clientId) {
    return new Promise((resolve, reject) => {
      if (!chrome.identity || !chrome.identity.launchWebAuthFlow) {
        reject(new Error('chrome.identity.launchWebAuthFlow is unavailable in this environment'));
        return;
      }

      const redirectUri = chrome.identity.getRedirectURL();
      const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file');
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;

      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive }, (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Google authentication flow failed'));
        } else if (!responseUrl) {
          reject(new Error('Authentication was cancelled or no response returned'));
        } else {
          try {
            const url = new URL(responseUrl);
            const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.substring(1) : url.hash);
            const token = hashParams.get('access_token');
            if (token) {
              resolve(token);
            } else {
              reject(new Error('No access_token returned in OAuth redirect'));
            }
          } catch (e) {
            reject(new Error(`Failed to parse OAuth response: ${e.message}`));
          }
        }
      });
    });
  }

  // Fallback to chrome.identity.getAuthToken if available (e.g. Web Store packaged build)
  return new Promise((resolve, reject) => {
    if (!chrome.identity || !chrome.identity.getAuthToken) {
      reject(new Error('chrome.identity API is unavailable in this browser. To enable Google Drive sync, provide a Google OAuth Client ID in Settings.'));
      return;
    }

    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error('Google Drive sync requires an OAuth Client ID. Please enter your Google Cloud Client ID in Drive Sync Settings, or export your tabs using 1-click JSON/Markdown.'));
      } else if (!token) {
        reject(new Error('No token returned from Google authentication'));
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * Remove cached auth token on disconnect / sign-out
 */
export async function clearAuthToken(token) {
  if (!token) return;
  try {
    await new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    });
  } catch (err) {
    console.warn('[TabVault Drive] Error clearing cached token:', err);
  }
}

/**
 * Find or create a dedicated backup folder in Google Drive
 */
async function getOrCreateBackupFolder(token, folderName = 'TabVault_Backups') {
  const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!searchRes.ok) {
    throw new Error(`Drive search failed: ${searchRes.statusText}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder if not found
  const createRes = await fetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create backup folder: ${createRes.statusText}`);
  }

  const folder = await createRes.json();
  return folder.id;
}

/**
 * Upload or update backup file in Google Drive
 */
async function uploadBackupFile(token, fileName, jsonData, targetFolder = 'appDataFolder') {
  const isAppData = targetFolder === 'appDataFolder';
  let parents = [];

  if (isAppData) {
    parents = ['appDataFolder'];
  } else {
    const folderId = await getOrCreateBackupFolder(token, 'TabVault_Backups');
    parents = [folderId];
  }

  // Check if existing file with this name exists in the folder
  const query = isAppData
    ? `name = '${fileName}' and 'appDataFolder' in parents and trashed = false`
    : `name = '${fileName}' and '${parents[0]}' in parents and trashed = false`;

  const spacesParam = isAppData ? '&spaces=appDataFolder' : '';
  const searchUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}${spacesParam}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  let existingFileId = null;
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      existingFileId = searchData.files[0].id;
    }
  }

  const metadata = {
    name: fileName,
    mimeType: 'application/json'
  };

  if (!existingFileId) {
    metadata.parents = parents;
  }

  const boundary = '-------TabVaultBackupBoundary' + Math.random().toString(36).slice(2);
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    jsonData +
    closeDelimiter;

  let uploadUrl = `${UPLOAD_API_BASE}/files?uploadType=multipart`;
  let method = 'POST';

  if (existingFileId) {
    uploadUrl = `${UPLOAD_API_BASE}/files/${existingFileId}?uploadType=multipart`;
    method = 'PATCH';
  }

  const uploadRes = await fetch(uploadUrl, {
    method: method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartBody
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Google Drive upload failed (${uploadRes.status}): ${errText}`);
  }

  return await uploadRes.json();
}

/**
 * Perform a full backup of all TabVault sessions to Google Drive
 */
export async function backupToGoogleDrive(interactive = true) {
  try {
    const token = await getAuthToken(interactive);
    const settings = await getSettings();
    const sessions = await getSessions();

    const backupPayload = {
      app: 'TabVault',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      timestamp: Date.now(),
      sessionCount: sessions.length,
      tabCount: sessions.reduce((acc, s) => acc + s.tabs.length, 0),
      sessions: sessions
    };

    const jsonString = JSON.stringify(backupPayload, null, 2);
    const targetFolder = settings.syncTarget || 'appDataFolder';

    // 1. Save or update the canonical latest backup
    await uploadBackupFile(token, 'tabvault_backup_latest.json', jsonString, targetFolder);

    // 2. Also save a timestamped snapshot
    const d = new Date();
    const dateStamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await uploadBackupFile(token, `tabvault_snapshot_${dateStamp}.json`, jsonString, targetFolder);

    // Update settings with last backup time
    await saveSettings({
      lastCloudBackup: Date.now(),
      driveConnected: true
    });

    return {
      success: true,
      timestamp: Date.now(),
      tabCount: backupPayload.tabCount,
      sessionCount: backupPayload.sessionCount
    };
  } catch (err) {
    console.error('[TabVault Cloud Sync] Backup error:', err);
    throw err;
  }
}

/**
 * List available backup snapshots stored in Google Drive
 */
export async function listGoogleDriveBackups(interactive = true) {
  try {
    const token = await getAuthToken(interactive);
    const settings = await getSettings();
    const targetFolder = settings.syncTarget || 'appDataFolder';
    const isAppData = targetFolder === 'appDataFolder';

    let query = "name contains 'tabvault_' and mimeType = 'application/json' and trashed = false";
    const spacesParam = isAppData ? '&spaces=appDataFolder' : '';
    const listUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}${spacesParam}&orderBy=modifiedTime desc&fields=files(id,name,size,modifiedTime,createdTime)`;

    const res = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error(`Failed to list backups: ${res.statusText}`);
    }

    const data = await res.json();
    return data.files || [];
  } catch (err) {
    console.error('[TabVault Cloud Sync] List backups error:', err);
    throw err;
  }
}

/**
 * Download and restore backup from Google Drive
 */
export async function restoreFromGoogleDrive(fileId, mergeMode = 'merge', interactive = true) {
  try {
    const token = await getAuthToken(interactive);
    const downloadUrl = `${DRIVE_API_BASE}/files/${fileId}?alt=media`;

    const res = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error(`Failed to download backup file: ${res.statusText}`);
    }

    const backupData = await res.json();
    if (!backupData || !Array.isArray(backupData.sessions)) {
      throw new Error('Downloaded file does not contain valid TabVault sessions data.');
    }

    const incomingSessions = backupData.sessions;
    let finalSessions = [];

    if (mergeMode === 'replace') {
      finalSessions = incomingSessions;
    } else {
      // Merge mode: Add any non-duplicate sessions
      const existing = await getSessions();
      const existingIds = new Set(existing.map(s => s.id));
      const newItems = incomingSessions.filter(s => !existingIds.has(s.id));
      finalSessions = [...newItems, ...existing];
    }

    await saveSessions(finalSessions);
    return {
      success: true,
      restoredCount: incomingSessions.length,
      totalCount: finalSessions.length
    };
  } catch (err) {
    console.error('[TabVault Cloud Sync] Restore error:', err);
    throw err;
  }
}
