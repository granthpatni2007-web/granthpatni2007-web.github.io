# Database Backend

This project now supports a shared order database through a small Node.js API.

## What it does

- Stores website orders in SQLite
- Lets customers submit orders from the storefront
- Lets the owner dashboard read and update orders with a private owner token
- Keeps the current browser-only local mode available as a fallback

## Start locally

Use Node.js 22.5 or newer so `node:sqlite` is available.

PowerShell:

```powershell
$env:OWNER_DASHBOARD_TOKEN="choose-a-long-secret-token"
node backend/server.js
```

The API starts on `http://localhost:3000/api`.

## Connect the website

Edit `site-config.js` and set:

```js
window.ANTARMANA_SITE_CONFIG = {
  orderApiBaseUrl: "http://localhost:3000/api",
  orderPollIntervalMs: 15000
};
```

## Owner dashboard access

- Customer order creation is public
- Owner order viewing and status updates require the `OWNER_DASHBOARD_TOKEN`
- When remote mode is enabled, the owner page asks for that token after unlock

## Deploy later

GitHub Pages can still host the storefront, but the backend must run somewhere else:

- Render
- Railway
- VPS
- Any Node host that supports Node 22+

After deployment, replace the local API URL in `site-config.js` with your live backend URL.
