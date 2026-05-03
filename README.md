# EcoPrint Reminder 🌱

EcoPrint Reminder is a Chrome extension that helps users become more conscious before printing webpages.

When a user opens print preview, EcoPrint estimates the number of pages and asks whether the document was actually printed or avoided. It tracks confirmed printed pages, estimated tree-equivalent usage, avoided prints, pages saved, and estimated trees saved.

The project is currently an MVP/prototype.

## Features

- Detects print attempts on normal webpages
- Estimates page count
- Lets the user correct the page count before saving
- Tracks confirmed printed pages
- Tracks estimated trees used
- Tracks avoided prints
- Tracks estimated pages and trees saved
- Shows eco-tips before confirmation
- Shows a visual habitat-impact animation after confirmed printing
- Stores all data locally in the browser

## Demo flow

1. Open a webpage.
2. Press `Ctrl + P`.
3. Close the print preview.
4. EcoPrint asks whether you printed or avoided the print.
5. Confirm or avoid.
6. Check the cumulative stats from the extension popup.

## Important limitation

EcoPrint currently works best on normal webpages.

PDFs opened inside Chrome's built-in PDF viewer may not be detected yet. Page counts are estimates and can be corrected by the user before saving.

## Installation for testing

1. Download or clone this repository.
2. Open Chrome.
3. Go to: chrome://extensions/.
4. Turn on Developer mode.
5. Click Load unpacked.
6. Select the extension/ folder.
7. Open any normal webpage and test printing with Ctrl + P.
