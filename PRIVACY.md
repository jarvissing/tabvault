# Privacy Policy for TabVault

**Last updated:** September 4, 2026

TabVault ("we", "our", or "the extension") is a privacy-first browser extension created to help users organize tabs, reclaim computer memory, and safeguard their data against accidental loss.

---

## 1. Zero Developer Server Architecture

TabVault operates on a **zero-telemetry, zero-remote-server model**:
- We operate **no external servers**, databases, or analytics services.
- We do **not** collect, inspect, track, log, or sell your browsing history, URLs, search queries, or tab contents.
- The extension runs 100% locally within your browser sandbox.

---

## 2. Information Handled by the Extension

### Local Storage (`chrome.storage.local`)
When you collapse tabs or save links:
- Tab metadata (URL, page title, favicon URL, timestamp, and domain) is stored directly on your computer using Chrome's local storage API.
- This data remains strictly on your local device and is never transmitted to us or any third party.

### Optional Google Drive Cloud Backup
If you choose to enable Google Drive automated cloud backup:
- The extension requests an OAuth2 token using Chrome's native `chrome.identity` API to authenticate with Google Drive.
- Backup snapshots containing your saved sessions are transmitted directly via HTTPS from your browser to your personal Google Drive account (`appDataFolder` or `TabVault_Backups`).
- We never have access to your Google account credentials, tokens, or backed-up files.

---

## 3. Extension Permissions and Why They Are Required

- **`tabs`**: Used exclusively when you trigger "Collapse Window" or "Send Tab to TabVault" to read the open URLs and page titles to save them into your vault.
- **`storage`** & **`unlimitedStorage`**: Used to store your saved tab sessions and user preferences on your computer without running into arbitrary size limits.
- **`identity`**: Used solely to connect to your personal Google Drive account if you opt into cloud backup.
- **`alarms`**: Used to schedule the optional 24-hour background backup and staging checks.
- **`downloads`**: Used when you click to download an HTML Bookmarks (.html), CSV (.csv), Markdown (.md), or JSON (.json) backup file to your computer.
- **`contextMenus`**: Used to provide convenient right-click browser menu options to save the active tab or collapse window tabs directly to TabVault.
- **`https://www.googleapis.com/*`**: Used exclusively to communicate with the official Google Drive REST API to upload and list your backup snapshots.

---

## 4. GDPR & CCPA Compliance

Because TabVault does not process, store, or transmit any personal data on external servers:
- You retain complete ownership and sovereignty over your data at all times.
- You can export your data at any time via standard JSON or Markdown.
- You can permanently delete all stored data at any time directly through the TabVault Settings menu.

---

## 5. Contact & Questions

If you have questions regarding this Privacy Policy, please contact:
- **Email:** privacy@tabvault.dev
- **GitHub:** https://github.com/tabvault/tabvault
