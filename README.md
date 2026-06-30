# timesheet-filler-extension
Chrome/Edge browser extension that auto-fills timesheet daily allocations. Detects rows from the page, distributes values as valid 0.125 multiples summing to 1.0, skips weekends and bank holidays, supports priority weighting (H/M/L) and live auto-adjustment.

# Timesheet Filler Extension

A Chrome/Edge browser extension to automatically fill timesheet allocations in Stafiz

## Features
- Auto-detects project rows from the timesheet page
- Distributes daily values as valid `0.125` multiples summing exactly to `1.0`
- Skips weekends (Sa/Su) automatically
- Skips bank holiday columns automatically
- Priority system: High (H) gets more value, Low (L) gets less
- Edit one row → others auto-adjust instantly
- Clear All button resets all cells to 0
- Works for any month without configuration

## Installation
1. Clone or download this repository
2. Open `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode**
4. Click **Load unpacked** → select this folder

## Files
| File | Purpose |
|---|---|
| `manifest.json` | Extension configuration |
| `app.html` | Popup UI |
| `popup.js` | Popup logic |
| `content.js` | Runs on timesheet page |

## Usage
1. Navigate to your timesheet page
2. Click the extension icon
3. Set priorities (H/M/L) per row
4. Click **Fill Timesheet**

## Constraints
- Values must be multiples of `0.125` (timesheet requirement)
- Maximum 8 fillable rows (8 × 0.125 = 1.0)
- Bank holiday rows are auto-skipped
