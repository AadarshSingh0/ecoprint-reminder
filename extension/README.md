# EcoPrint Reminder v0.2

EcoPrint Reminder is a beginner-friendly Chrome extension that estimates the environmental cost of printing.

## What changed in v0.2

- The extension no longer inserts a reminder before printing, so the EcoPrint box should not appear on printed pages.
- Opening print preview does not automatically increase the lifetime count.
- After print preview closes, EcoPrint asks the user whether they actually printed.
- The user can correct the estimated page count before saving.
- The popup also shows any pending print estimate, so the user can confirm or ignore it from the extension icon.

## Current limitation

A normal browser extension cannot reliably know the exact final printer job details on Windows/macOS/Linux. It usually cannot know whether the user printed double-sided, selected a page range, changed scale, or cancelled printing.

So EcoPrint uses an honest workflow:

1. Detect print preview.
2. Estimate pages.
3. Ask the user to confirm or correct.
4. Add only confirmed prints to the cumulative total.

## How to install locally

1. Open Chrome.
2. Go to `chrome://extensions/`.
3. Turn on Developer mode.
4. Click **Load unpacked**.
5. Select this folder.

## Files

- `manifest.json`: extension configuration and permissions.
- `content.js`: detects print preview and shows confirmation after preview closes.
- `popup.html`: extension popup layout.
- `popup.css`: popup styling.
- `popup.js`: popup logic, storage, confirm/ignore/reset buttons.


## New in v0.3
- After a confirmed print, EcoPrint shows a small tree-chop animation as a playful reminder.
- The animation appears in the webpage confirmation flow and as a mini animation in the popup if you confirm there.

## New in v0.4
- Replaced the older coded axe animation with the user's custom v6 animation.
- The new animation uses a chainsaw/power cutter, a lusher tree canopy, a nest with eggs, and a habitat/carbon loss label.
- The animation is isolated using Shadow DOM so its CSS does not interfere with normal webpages.

## New in v0.5
- Reduced the size of the post-confirmation animation modal.
- Added eco-tips in the confirmation dialog before the user confirms printing.
- Changed cancellation into an avoided-print action.
- Added cumulative avoided-print stats: avoided events, pages saved, and estimated trees saved.
- Added a note that PDFs opened in Chrome's built-in viewer may not be detected yet.

## Corrected v0.5.1
- Replaced the v5 manually-resized animation with the user's approved v7 extension-size animation.
- Preserved v5 features: eco-tips, avoided-print tracking, popup stats, and PDF limitation note.

## New in v0.5.2
- Replaced the animation with the final production animation supplied by the user.
- Preserved v5 features: eco-tips, avoided-print tracking, popup stats, and PDF limitation note.
- Kept the animation isolated in Shadow DOM and preserved the production 440px/scale-based sizing.
