# Movie Poster Finder - Figma Plugin

A Figma plugin that allows designers to search and insert high-quality movie and
TV show posters directly into their designs using The Movie Database (TMDB) API.

![Movie Poster Finder](https://img.shields.io/badge/Figma-Plugin-purple)
![Performance](https://img.shields.io/badge/Performance-High--Speed-blue)
![TMDB API](https://img.shields.io/badge/TMDB-API-green)

<img src="assets/movie poter cover.jpg" height="600" alt="Movie Poster Cover">

## 📋 Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Architecture & Performance](#architecture--performance)
- [Code Structure](#code-structure)
- [API Configuration](#api-configuration)
- [License](#license)

## ✨ Features

### ⚡ 1. **High-Speed Insertion**

- **Canvas Capture Engine**: Uses a specialized UI-thread capture logic to grab
  image data directly from rendered DOM elements.
- **CORS Bypass**: Eliminates double-downloading and CORS issues by "taking a
  snapshot" of the thumbnail.
- **Near-Instant**: Posters are applied to frames in milliseconds, providing a
  snappy, premium feel.

### 🔍 2. **Smart Search & Caching**

- **Live Search**: Results appear in real-time as you type, with smart
  debouncing.
- **Result Caching**: Results for Movies and TV shows are cached in memory.
  Toggling between categories is now instant with zero network delay.
- **History Aware**: Remembers your latest search results within the session.

### 🔥 3. **Trending Content**

- View daily trending movies or TV shows (up to 12 items).
- Automatically updates when switching between "🎬 Movies" and "📺 TV" chips.
- Custom loading placeholders with movie slate icons.

### 🎲 4. **Random Poster Selection**

- "Pick for me" feature selects highly-rated posters (7.0+ score).
- Automatically fills your selection or creates a new poster node at your
  viewport center.

### 🎨 5. **Premium Interface**

- **Modern Palette**: Vibrant lavender/purple theme (`#5719A3`).
- **Persistent Feedback**: Informative snackbars with progress states (Fetching
  ⬇️, Inserting 🔄, Added ✅).
- **Optically Centered**: Every icon and placeholder is mathematically and
  visually balanced.
- **Lazy Loading**: Images are fetched only when they enter the viewport for
  maximum performance.

## 🚀 Installation

### Prerequisites

- [Node.js](https://nodejs.org/)
- Figma desktop application
- TMDB API key (free)

### Setup Steps

1. **Clone or download this repository**
   ```bash
   cd /path/to/plugin/directory
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Compile TypeScript**
   ```bash
   npm run build
   # Or use watch mode
   npm run watch
   ```

4. **Load in Figma**
   - Open Figma Desktop
   - Go to `Plugins` > `Development` > `Import plugin from manifest`
   - Select the `manifest.json` file from this directory.

## 📖 Usage

1. **Choose Category**: Click "🎬 Movies" or "📺 TV" to see what's trending.
2. **Search**: Use the search action card to find specific posters.
3. **Random Pick**: Click "Pick for me" for high-quality surprise posters.
4. **Insert**: Click any poster thumbnail.
   - **If selected**: The poster replaces the fill of your selected
     frame/rectangle.
   - **If nothing selected**: A new 200x300 poster node is created at your
     center.

## 🏗️ Architecture & Performance

### **The "High-Speed" Engine**

The plugin uses a unique two-tier architecture to bypass standard Figma image
bottlenecks:

1. **Tier 1 (UI Thread)**: Images are loaded into a hidden canvas. We use
   `canvas.toBlob` and `FileReader` to generate a `Uint8Array` directly from the
   browser's rendered data. This bypasses the need for the Main Thread (plugin
   logic) to make a second network request.
2. **Tier 2 (Main Thread)**: Receives raw bytes and uses `figma.createImage()`
   for instantaneous application to the scene.

### **Optimization Work**

- **SVG Compaction**: Large SVG data URLs for icons are moved to CSS variables,
  reducing the `ui.html` weight and preventing IDE crashes.
- **DOM Efficiency**: Uses `requestAnimationFrame` and `DocumentFragment` for
  ultra-smooth grid rendering.
- **Cleanup**: The codebase has been audited for dead code, duplicate functions,
  and redundant API calls.

## 🏗️ Code Structure

```
Movie_poster/
├── manifest.json      # Plugin config & network permissions
├── code.ts           # Main plugin thread (insertion logic, node management)
├── ui.html           # UI thread (UI, styling, canvas capture engine)
├── package.json      # Scripts & dependencies
└── README.md         # Documentation
```

## 🔧 API Configuration

**Base URL:** `https://api.themoviedb.org/3`

**Network Permissions:** The plugin is configured with `networkAccess`
permissions for `api.themoviedb.org` and `image.tmdb.org` to ensure smooth image
fetching.

## 📝 License

This project uses The Movie Database (TMDB) API but is not endorsed or certified
by TMDB. You must comply with their
[terms of service](https://www.themoviedb.org/terms-of-use).

---

**Created with ❤️ for Figma by Asif**
