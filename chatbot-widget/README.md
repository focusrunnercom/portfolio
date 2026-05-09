# FocusRunner Chat Widget

Self-contained HTML widget for lead qualification. Works on any website — no framework required.

## Usage

Paste this one line before `</body>` on your page:

```html
<script src="https://cdn.jsdelivr.net/gh/lambogreet7-ai/FocusRunner@main/chatbot-widget/index.html"></script>
```

Or copy the contents of `index.html` and paste the entire `<script>` block.

## How it works

1. **Interest** → choose what brings you here
2. **Name** → free text
3. **Email** → with validation
4. **Phone** → optional (can skip)
5. **Time** → preferred contact time
6. **Confirm** → review & send

## Configuration

Edit the `FR_CHAT_CONFIG` object in the script:

```js
var FR_CHAT_CONFIG = {
  primaryColor: '#00D4AA',        // accent color
  apiUrl: 'http://localhost:8765/api/lead',  // backend endpoint
  brandName: 'FocusRunner',       // brand name in header
};
```

## Backend

See `backend/server.py` for the Python API server (Flask + SQLite).
