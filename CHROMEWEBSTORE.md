# Chrome Web Store Listing — TabVault

> Last Updated: 2026-09-04

## Store Listing

**Extension Name** [REQUIRED]
TabVault — Zero-Data-Loss Tab Manager & OneTab Alternative

**Short Description** [REQUIRED]
Free up 95% of memory. Collapse tabs with automated Google Drive backup, OneTab migration, and 1-click Notion & Markdown export.

**Detailed Description** [REQUIRED]
TabVault is the modern, privacy-first, zero-data-loss alternative to OneTab. Reclaim up to 95% of your computer's RAM by converting cluttered browser tabs into an organized session list with automated Google Drive cloud backup.

Tired of losing hundreds of saved tabs during browser crashes or unexpected Chrome updates? TabVault eliminates data loss by combining strict schema-validated local storage with optional automated cloud backups directly to your personal Google Drive account. TabVault operates with zero developer servers, zero tracking scripts, and complete data ownership.

KEY FEATURES:
- 1-Click Tab Collapse: Collapse open tabs in the current window instantly using toolbar button or keyboard shortcut (Ctrl+Shift+K / Cmd+Shift+K).
- Automated Google Drive Backup: Backs up your sessions automatically every 24 hours directly to your Google Drive account with zero server intermediaries.
- Custom Session Tags & Filter Bar: Categorize sessions with color tags (#Work, #Dev, #Reading) and filter your vault with 1-click tag chips.
- Smart Tab Overload & Memory Alert: Toolbar badge alerts you when open tabs exceed your custom threshold to keep your browser fast.
- Netscape HTML Bookmarks & CSV Export: 1-click export to native browser bookmarks (importable into Chrome, Firefox, Safari) and spreadsheet CSV.
- Effortless OneTab Migration: Paste your raw OneTab export text to instantly transfer your saved tabs into TabVault.
- 1-Click Notion & Markdown Export: Copy clean Markdown tables or bulleted lists ([Title](URL)) ready to paste straight into Notion, Obsidian, or GitHub.
- Full-Text Fuzzy Search: Instantly filter across all your saved tab titles, URLs, and domains by pressing "/" on your keyboard.
- Safe Undo Stack: Reversible 7-second Undo toast for any accidentally deleted tab or group.
- Lock & Pin Groups: Lock important research sessions to prevent accidental deletion and pin frequent groups to the top.
- Tab Drag & Drop: Effortlessly reorder tabs within a session or drag tabs between different groups.
- Memory & System Metrics: See exact stats on total tabs saved, organized groups, and estimated RAM freed.
- Dark Mode by Default: Modern, distraction-free interface with Dark, Light, and System theme support.

HOW TO USE TABVAULT:
1. When you have too many open tabs, click the TabVault icon in your toolbar or press Ctrl+Shift+K (Cmd+Shift+K on Mac).
2. All your tabs are instantly organized into a clean, dated session list.
3. Open the TabVault Dashboard to search, rename, reorder, or restore individual tabs or whole sessions.
4. Connect Google Drive in Settings to ensure your tabs are backed up automatically.

PRIVACY & ZERO TRACKING GUARANTEE:
Your privacy is our priority. TabVault runs completely client-side in your browser. We have no remote analytics servers and do not collect, sell, or inspect your browsing history. Cloud backups are transmitted exclusively between your browser and your private Google Drive account.

SUPPORT & FEEDBACK:
Have questions, feature requests, or feedback? Check our documentation or submit an issue on our GitHub project page.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Saves open tabs into organized sessions to reduce memory usage, with automated cloud backup and document export.

**Primary Language** [REQUIRED]
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|---|---|---|---|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Small Icon | 48×48 PNG | ✅ Ready | `icons/icon-48.png` |
| Badge Icon | 16×16 PNG | ✅ Ready | `icons/icon-16.png` |
| Vector Master Icon | Scalable SVG | ✅ Ready | `icons/icon.svg` |
| Screenshot 1 (Dashboard) [REQUIRED] | 1280×800 | 🟡 Prepared | Shows main dashboard with session cards, metrics, and search |
| Screenshot 2 (Drive Cloud Sync) [RECOMMENDED] | 1280×800 | 🟡 Prepared | Shows Google Drive backup options and snapshot manager |
| Screenshot 3 (OneTab & Notion Export) [RECOMMENDED] | 1280×800 | 🟡 Prepared | Shows OneTab importer and Markdown export preview |
| Small Promo Tile [RECOMMENDED] | 440×280 | 🟡 Prepared | TabVault logo, memory badge, and tagline |
| Marquee Promo Tile | 1400×560 | 🟡 Prepared | Banner illustration showing tab collapse to vault |

---

## Permissions Justification

| Permission | Type | Justification |
|---|---|---|
| `tabs` | permissions | Required to read URLs and titles of open browser tabs when the user chooses to collapse them into TabVault or send the active tab. |
| `storage` | permissions | Required to store saved tab sessions, user preferences, theme configuration, and crash recovery staging locally on the device. |
| `contextMenus` | permissions | Required to add right-click context menu options to send individual tabs or all window tabs directly to TabVault. |
| `identity` | permissions | Required to obtain an OAuth token for the user's personal Google Drive account to perform zero-cost automated cloud backups. |
| `alarms` | permissions | Required to trigger the periodic 24-hour background cloud backup schedule and crash recovery heartbeat. |
| `unlimitedStorage` | permissions | Required to ensure users with thousands of saved tabs never experience data truncation or local storage quota exhaustion. |
| `https://www.googleapis.com/*` | host_permissions | Required exclusively to transmit backup snapshot JSON files directly between the browser and the user's private Google Drive API. |

---

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

TabVault does not transmit any user data, URLs, or browsing activity to any developer servers or third parties. All tab URLs and session metadata are stored locally in the browser's `chrome.storage.local`. When the user explicitly activates Google Drive sync, backup files are sent directly to the user's own Google Drive storage.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|---|---|---|---|---|
| Personally identifiable info | No | No | N/A | No |
| Health info | No | No | N/A | No |
| Financial info | No | No | N/A | No |
| Authentication info | No | Only to Google OAuth | User-authorized Google Drive token | No |
| Personal communications | No | No | N/A | No |
| Location | No | No | N/A | No |
| Web history | No | Only to User's Drive | Tab URLs saved locally and in user's Drive | No |
| User activity | No | No | N/A | No |
| Website content | No | No | N/A | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
`https://github.com/jarvissing/tabvault/blob/main/PRIVACY.md`

---

## Distribution

**Visibility**: Public  
**Regions**: All regions  
**Pricing**: Free (100% free and open-source)  

---

## Developer Info

**Publisher Name** [REQUIRED]
TabVault Open Source Team

**Contact Email** [REQUIRED]
support@tabvault.dev

**Homepage URL** [RECOMMENDED]
https://tabvault.dev

---

## Version History

| 1.0.0 | 2026-09-05 | Full production release: Manifest V3 core, automated Google Drive sync, session tags & filter bar, tab threshold memory alerts, Netscape HTML Bookmarks & CSV exports, OneTab import, Notion/Markdown export, and Firefox AMO cross-browser build. | Ready |
