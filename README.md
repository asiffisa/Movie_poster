# Movie Poster Finder - Figma Plugin

A Figma plugin that allows designers to search and insert high-quality movie and
TV show posters directly into their designs using The Movie Database (TMDB) API.

![Movie Poster Finder](https://img.shields.io/badge/Figma-Plugin-purple)

![TMDB API](https://img.shields.io/badge/TMDB-API-green)

<img src="assets/movie poter cover.jpg" height="600" alt="Movie Poster Cover">

## 📋 Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Code Structure](#code-structure)
- [API Configuration](#api-configuration)
- [License](#license)

## Features

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

- **Modern Palette**: Vibrant lavender/purple theme.
- **Persistent Feedback**: Informative snackbars with progress states (Fetching
  ⬇️, Added ✅).

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
