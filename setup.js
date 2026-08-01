#!/usr/bin/env node
// Injects the public Cloudflare Worker URL into the generated Figma plugin.
// The TMDB API key deliberately never enters the plugin bundle.
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const codePath = path.join(__dirname, 'code.js');
const uiPath = path.join(__dirname, 'ui.html');
const manifestPath = path.join(__dirname, 'manifest.json');
const placeholder = '"__TMDB_PROXY_URL__"';

const uiAssets = {
  search: path.join(__dirname, 'assets', 'Search mv.png'),
  dice: path.join(__dirname, 'assets', 'Dice mv.png')
};

if (!fs.existsSync(codePath)) {
  console.error('Error: code.js not found. Run the TypeScript build first.');
  process.exit(1);
}

function getProxyUrl() {
  if (!fs.existsSync(envPath)) return null;
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/^TMDB_PROXY_URL\s*=\s*(.+)$/m);
  if (!match || !match[1].trim()) return null;
  const value = match[1].trim().replace(/^['"]|['"]$/g, '').replace(/\/$/, '');
  try {
    const url = new URL(value);
    const isLocalDevelopment = url.protocol === 'http:' && url.hostname === 'localhost';
    return url.protocol === 'https:' || isLocalDevelopment ? url.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

function inject() {
  const proxyUrl = getProxyUrl();
  syncManifestNetworkAccess(proxyUrl);
  if (!proxyUrl) {
    console.warn('TMDB_PROXY_URL is not configured yet. The plugin will show setup instructions until the Worker is deployed.');
    return;
  }

  const code = fs.readFileSync(codePath, 'utf8');
  if (code.includes(placeholder)) {
    fs.writeFileSync(codePath, code.replace(placeholder, JSON.stringify(proxyUrl)), 'utf8');
    console.log('Cloudflare Worker URL injected into code.js successfully.');
  }
}

function syncManifestNetworkAccess(proxyUrl) {
  if (!fs.existsSync(manifestPath)) return;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const productionDomains = ['https://image.tmdb.org'];
  if (proxyUrl) {
    const proxy = new URL(proxyUrl);
    if (proxy.protocol === 'https:') productionDomains.unshift(proxy.origin);
  }

  manifest.networkAccess = {
    ...(manifest.networkAccess || {}),
    allowedDomains: productionDomains,
    devAllowedDomains: ['http://localhost:8787']
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function injectUiAssets() {
  if (!fs.existsSync(uiPath)) return;
  let html = fs.readFileSync(uiPath, 'utf8');

  Object.entries(uiAssets).forEach(([name, assetPath]) => {
    if (!fs.existsSync(assetPath)) {
      console.warn(`UI asset missing: ${assetPath}`);
      return;
    }
    const marker = `data-action-asset="${name}" src="data:image/png;base64,`;
    const markerStart = html.indexOf(marker);
    if (markerStart < 0) return;
    const base64Start = markerStart + marker.length;
    const base64End = html.indexOf('"', base64Start);
    if (base64End < 0) return;
    const base64 = fs.readFileSync(assetPath).toString('base64');
    html = `${html.slice(0, base64Start)}${base64}${html.slice(base64End)}`;
  });

  fs.writeFileSync(uiPath, html, 'utf8');
}

injectUiAssets();
inject();

if (process.argv.includes('--watch')) {
  console.log('Watching code.js for rebuilds...');
  fs.watch(codePath, (eventType) => {
    if (eventType === 'change') setTimeout(inject, 200);
  });
}
