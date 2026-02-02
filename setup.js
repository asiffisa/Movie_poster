#!/usr/bin/env node
// Reads TMDB_API_KEY from .env and injects it into code.js
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const codePath = path.join(__dirname, 'code.ts');

if (!fs.existsSync(envPath)) {
  console.error('Error: .env file not found. Copy .env.example to .env and add your TMDB API key.');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/TMDB_API_KEY\s*=\s*(.+)/);

if (!match || !match[1].trim()) {
  console.error('Error: TMDB_API_KEY not found in .env file.');
  process.exit(1);
}

const apiKey = match[1].trim();
let code = fs.readFileSync(codePath, 'utf8');
code = code.replace('"__TMDB_API_KEY__"', JSON.stringify(apiKey));
fs.writeFileSync(codePath, code, 'utf8');

console.log('API key injected into code.js successfully.');
