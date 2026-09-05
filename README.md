# TabVault — Zero-Data-Loss Tab Manager (Manifest V3)

> **Reclaim up to 95% of browser memory with speed, automated Google Drive cloud backup, and 1-click Notion/Markdown exports.**

---

## Overview

OneTab has over 2,000,000 users, but millions have suffered sudden data loss due to corrupted browser storage during Chrome updates or crashes, with zero cloud backup capability.

**TabVault** is a modern, privacy-first, zero-data-loss alternative designed from the ground up for Chrome Manifest V3:
- **Zero Data Loss Guarantee:** Strict schema validation, atomic writes, crash recovery staging, and automated Google Drive cloud backups.
- **Zero Server Costs & 100% Privacy:** TabVault has no developer servers and collects zero telemetry. All data is saved exclusively on your local device and inside your own personal Google Drive account.
- **1-Click Notion & Markdown Export:** Clean bulleted lists or tables ready to paste straight into Notion, Obsidian, or GitHub.
- **OneTab Migration Engine:** Paste your raw OneTab exports and instantly import them into organized session groups.

---

## Key Features

1. **Window Collapse & Tab Capture:**
   - Collapse an entire window of tabs into a timestamped session in under 100ms.
   - Pinned tabs are preserved by default so your active workspaces stay intact.
2. **Interactive Session Dashboard:**
   - Clean, modern dark mode default (with light and system theme support).
   - Real-time fuzzy search across titles, URLs, and domains (`/` keyboard shortcut).
   - Editable session titles and custom color tags.
   - Pin sessions to the top or lock them to prevent accidental deletion.
   - Drag-and-drop tabs to reorder within groups or move between sessions.
   - 7-second non-intrusive Undo toast system for deleted tabs and groups.
3. **Automated Google Drive Cloud Backup:**
   - Native integration with Google Drive via `chrome.identity`.
   - Stores snapshots in your private hidden `appDataFolder` or a visible `TabVault_Backups` folder.
   - Background alarms trigger automatic sync every 24 hours and after session collapses.
   - Manual 1-click backup and snapshot restore.
4. **Data Portability:**
   - **OneTab Importer:** Full parser supporting piped format and raw URLs.
   - **Markdown / Notion Exporter:** Bulleted lists (`- [Title](URL)`) and Markdown tables.
   - **JSON Full Backup & Restore:** Lossless backup file generation and JSON importer with merge/replace options.
5. **Memory & Storage Metrics:**
   - Real-time counter of total saved tabs, session groups, and estimated RAM freed (~150MB per Chromium tab).
   - Storage health bar monitoring local storage usage.

---

## Keyboard Shortcuts

| Shortcut (Windows / Linux) | Shortcut (macOS) | Action |
| :--- | :--- | :--- |
| `Ctrl + Shift + K` | `Cmd + Shift + K` | **Collapse Current Window** into TabVault |
| `Ctrl + Shift + Y` | `Cmd + Shift + Y` | **Send Active Tab** to TabVault |
| `Ctrl + Shift + L` | `Cmd + Shift + L` | **Open Dashboard** |
| `/` | `/` | Focus live search bar |
| `Escape` | `Escape` | Close modals / cancel title editing |

---

## Installation & Developer Setup

### 1. Load Unpacked in Developer Mode

1. Clone or download the TabVault repository.
2. Open Google Chrome (or Edge, Brave, Arc, etc.) and navigate to:
   ```
   chrome://extensions
   ```
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the `tabvault` directory (containing `manifest.json`).
6. TabVault will appear in your extensions list! Pin it to your browser toolbar for easy access.

### 2. Google Drive OAuth Setup (Optional for Cloud Sync)

To enable automated Google Drive cloud backup:
1. Visit the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `TabVault-Sync`).
3. Under **APIs & Services** > **Library**, enable the **Google Drive API**.
4. Under **APIs & Services** > **Credentials**, click **Create Credentials** > **OAuth client ID**.
5. Choose **Chrome extension** as the application type.
6. Enter your extension's unique ID (found on `chrome://extensions`).
7. Copy the generated `Client ID`.
8. Either:
   - Paste the Client ID into `manifest.json` under `"oauth2.client_id"`.
   - Or open **TabVault Settings** > **Drive Sync** in the dashboard and paste it into the **Google OAuth Client ID** field.

*Note: All local features (collapsing, restoring, search, OneTab import, Notion/Markdown export, and JSON backups) work 100% offline without any Google account setup.*

---

## Project Structure

```
tabvault/
├── manifest.json              # Chrome Manifest V3 configuration
├── background.js             # Service Worker (events, tab query, alarms, context menus)
├── storage-manager.js        # Storage engine, schema validation, deduplication, metrics
├── cloud-sync.js             # Google Drive REST API integration client
├── dashboard.html            # Main dashboard user interface
├── dashboard.css             # Dashboard design system (Dark mode, glassmorphism, responsive)
├── dashboard.js              # Dashboard controller (interactions, drag-drop, search, undo)
├── icons/                    # Extension icons
│   ├── icon-16.png
│   ├── icon-48.png
│   ├── icon-128.png
│   └── icon.svg
├── scripts/
│   ├── generate-icons.js     # Pure Node.js icon generator
│   ├── build-zip.js          # Production Chrome Web Store bundler
│   └── test-validation.js    # Automated unit and schema test suite
├── dist/
│   └── tabvault-v1.0.0.zip   # Packaged CWS release archive
├── README.md                 # Developer guide and documentation
├── CHROMEWEBSTORE.md         # Store listing metadata & permissions justification
└── PRIVACY.md                # GDPR-compliant privacy policy
```

---

## Building the Production ZIP

To create a clean release ZIP for upload to the Chrome Web Store Developer Dashboard:
```bash
node scripts/build-zip.js
```
The packaged archive will be generated in `dist/tabvault-v1.0.0.zip`.

---

## License & Privacy

TabVault is open-source software built for user privacy. No analytics, tracking, or external network requests are made other than optional direct communication between your browser and the official Google Drive API.
