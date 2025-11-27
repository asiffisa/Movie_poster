# Movie Poster Finder - Figma Plugin

A Figma plugin that allows designers to search and insert high-quality movie and TV show posters directly into their designs using The Movie Database (TMDB) API.

![Movie Poster Finder](https://img.shields.io/badge/Figma-Plugin-purple)
![TMDB API](https://img.shields.io/badge/TMDB-API-green)

## 📋 Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Code Structure](#code-structure)
- [API Configuration](#api-configuration)
- [Technical Details](#technical-details)
- [Development](#development)
- [License](#license)

## ✨ Features

### 1. **Media Type Selection**
- Switch between **Movies** and **TV Shows** with intuitive chip selectors
- Automatic placeholder and trending content updates based on media type

### 2. **Trending Content**
- View daily trending movies or TV shows (up to 12 items)
- Grid layout with poster images, titles, and release years
- Loading placeholders for smooth user experience
- Lazy-loaded images for optimal performance

### 3. **Search Functionality**
- Live search with real-time results
- Search both movies and TV shows
- Display up to 9 results per search
- Shows title, year, and poster preview
- Smart empty state handling

### 4. **Random Poster Selection**
- Get random high-quality posters from popular content
- Filters: minimum 7.0 rating, 50+ votes
- Automatically creates or uses selected frame

### 5. **Poster Insertion**
- Click any poster to insert into Figma
- Supports both new rectangle creation and existing frame filling
- Automatic image conversion and optimization
- Smart fallback handling for different node types

### 6. **Modern UI/UX**
- Clean, modern interface with custom design system
- Responsive layout (440x720 default)
- Custom color palette with purple/lavender theme
- Smooth transitions and hover effects
- Keyboard navigation support
- Loading states and error handling

## 🚀 Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (includes npm)
- Figma desktop application
- TMDB API key (free tier available)

### Setup Steps

1. **Clone or download this repository**
   ```bash
   cd /path/to/plugin/directory
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure TMDB API Key**
   - Get your free API key from [The Movie Database](https://www.themoviedb.org/settings/api)
   - Open `code.js` (or `code.ts` if using TypeScript)
   - Replace the placeholder API key:
     ```javascript
     const TMDB_KEY = "your_api_key_here";
     ```

4. **Compile TypeScript** (if using TypeScript)
   ```bash
   npm run build
   ```
   Or for development with watch mode:
   ```bash
   npm run watch
   ```

5. **Load in Figma**
   - Open Figma Desktop
   - Go to `Plugins` > `Development` > `Import plugin from manifest`
   - Select the `manifest.json` file from this directory

## 📖 Usage

### Basic Workflow

1. **Open the plugin** in Figma via `Plugins` menu

2. **Choose media type**
   - Click "🎬 Movies" or "📺 TV" chip to switch

3. **Browse trending content**
   - Scroll through daily trending items on the home screen
   - Click any poster to insert it into your design

4. **Search for specific content**
   - Click the "Search" action card on home screen
   - Type movie/TV show name in the search field
   - Live results appear as you type
   - Click any result to insert

5. **Get random poster**
   - Click the "Random pick" action card
   - Plugin automatically selects a high-rated poster
   - Inserted into selected frame or new rectangle

### Advanced Usage

**Inserting into existing frames:**
- Select a frame, rectangle, or shape before clicking a poster
- Plugin will fill the selected object with the poster image

**Creating new frames:**
- Don't select anything
- Click any poster
- Plugin creates a new 200x300 rectangle at viewport center

## 🏗️ Code Structure

### Main Files

```
Movie_poster/
├── manifest.json          # Plugin configuration
├── code.js               # Main plugin logic (compiled from code.ts)
├── code.ts              # Source TypeScript file
├── ui.html              # Plugin UI (complete HTML/CSS/JS)
├── package.json         # npm dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

### Code Architecture

#### **code.js / code.ts** - Main Plugin Logic

**Constants & Configuration:**
```javascript
const TMDB_KEY = "...";              // API key
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
```

**Core Functions:**

1. **`safeJson(url)`**
   - Robust fetch wrapper with error handling
   - Returns parsed JSON or throws error

2. **`fetchPosterAsDataUrl(posterPath)`**
   - Converts remote image to base64 data URL
   - Used for immediate poster display in UI
   - Returns `data:image/jpeg;base64,...` string

3. **`getOrCreateTargetNode()`**
   - Gets current selection or creates new rectangle
   - Handles selection validation
   - Returns target node or null with error message

4. **`performSearch(mediaType, query, isLive)`**
   - Unified search function for live and manual searches
   - Implements search debouncing with serial numbers
   - Fetches up to 9 results with poster previews
   - Returns results to UI via postMessage

5. **`fetchTrending(mediaType)`**
   - Gets daily trending content (up to 12 items)
   - Fetches poster data URLs in parallel
   - Sends to UI for grid display

6. **`insertPoster(node, posterUrl, label)`**
   - Downloads poster image
   - Creates Figma image hash
   - Applies as fill to target node
   - Handles fallback scenarios

7. **`randomPick(mediaType)`**
   - Uses TMDB discover API
   - Filters by rating ≥ 7.0 and votes ≥ 50
   - Random page and item selection
   - Inserts directly into design

**Message Handler:**
```javascript
figma.ui.onmessage = async (msg) => {
  // Handles: live-search, search, get-trending,
  //          insert-poster, random-pick, close
}
```

#### **ui.html** - Complete UI Layer

**Structure:**
- **Styles:** Embedded CSS with custom design system
- **Markup:** Two main views (home, search) with modern layout
- **Scripts:** Event handling, rendering, API communication

**Key Components:**

1. **Design System (CSS)**
   ```css
   --bg: #F8F4FD;              /* Light purple background */
   --divider: #E1DAEA;         /* Soft purple dividers */
   --text: #111111;            /* Dark text */
   --chip-active-stroke: #5719A3;    /* Active purple */
   --chip-active-fill: #DACAF3;      /* Light active */
   --poster-radius: 12px;      /* Rounded corners */
   --card-radius: 28px;        /* Action cards */
   ```

2. **Views:**
   - **Home View** (`#homeView`): 
     - Media type chips (Movies/TV)
     - Action cards (Search, Random)
     - Trending grid (3 columns, responsive)
   
   - **Search View** (`#searchView`):
     - Search input with live results
     - Results grid with empty states
     - Back navigation

3. **JavaScript Functions:**
   - `setActiveChip(type)` - Switch media types
   - `renderGrid(container, items)` - Display posters
   - `handleGridClick(e)` - Event delegation for clicks
   - `showLoadingPlaceholders(container)` - Loading states

4. **Message Handling:**
   ```javascript
   window.onmessage = (event) => {
     const msg = event.data.pluginMessage;
     // Handles: trending-results, search-results,
     //          inserted, snackbar, no-selection
   }
   ```

### Data Flow

```
User Action (UI)
    ↓
postMessage to Plugin
    ↓
Message Handler (code.js)
    ↓
API Call to TMDB
    ↓
Data Processing
    ↓
postMessage to UI
    ↓
UI Update (render)
```

## 🔧 API Configuration

### TMDB API Details

**Base URL:** `https://api.themoviedb.org/3`

**Endpoints Used:**

1. **Search**
   ```
   GET /search/{movie|tv}?api_key={key}&query={query}&page=1
   ```

2. **Trending**
   ```
   GET /trending/{movie|tv}/day?api_key={key}
   ```

3. **Discover** (for random picks)
   ```
   GET /discover/{movie|tv}?api_key={key}&sort_by=popularity.desc
       &vote_average.gte=7.0&vote_count.gte=50&page={random}
   ```

**Image Base URL:** `https://image.tmdb.org/t/p/w500{poster_path}`

**Response Fields Used:**
- `id` - Unique identifier
- `title` / `name` - Movie/TV show title
- `poster_path` - Relative path to poster
- `release_date` / `first_air_date` - Release date
- `vote_average` - Rating (0-10)
- `vote_count` - Number of votes

## 🔍 Technical Details

### Network Access
Configured in `manifest.json`:
```json
{
  "networkAccess": {
    "allowedDomains": [
      "https://api.themoviedb.org",
      "https://image.tmdb.org"
    ]
  }
}
```

### Editor Compatibility
Works in:
- Figma
- FigJam
- Slides
- Buzz (Figma's presentation mode)

### Performance Optimizations

1. **Image Loading**
   - Lazy loading with `loading="lazy"` attribute
   - Async decoding (`decoding="async"`)
   - Responsive images with `srcset` and `sizes`
   - Data URLs for immediate thumbnails

2. **Search Optimization**
   - Search serial numbers prevent stale results
   - Live search debouncing via serial check
   - Limited result sets (9 search, 12 trending)

3. **UI Performance**
   - Document fragments for batch DOM updates
   - Event delegation for grid clicks
   - CSS transitions for smooth interactions
   - Loading placeholders while fetching

### Error Handling

- Network errors with user-friendly messages
- Fallback placeholder images on load failure
- Graceful degradation for missing API key
- Selection validation before insertion
- Try-catch blocks around all async operations

## 👨‍💻 Development

### Available Scripts

```bash
# Build TypeScript once
npm run build

# Watch mode (auto-rebuild on save)
npm run watch

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

### TypeScript Configuration

The plugin uses TypeScript for type safety. Key config in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES6",
    "typeRoots": ["./node_modules/@types", "./node_modules/@figma"]
  }
}
```

### Dependencies

**Dev Dependencies:**
- `@figma/plugin-typings` - Figma API type definitions
- `typescript` - TypeScript compiler
- `eslint` - Code linting

### Plugin Manifest

Key attributes in `manifest.json`:
```json
{
  "name": "Movie_poster",
  "id": "1571607350942224915",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma", "figjam", "slides", "buzz"],
  "documentAccess": "dynamic-page"
}
```

## 🐛 Troubleshooting

**Issue:** "Network error" messages
- **Solution:** Ensure TMDB API key is configured in `code.js`
- Verify internet connection
- Check TMDB API status

**Issue:** Posters not inserting
- **Solution:** Ensure a valid frame/rectangle is selected
- Try creating new rectangle (deselect all before clicking poster)

**Issue:** Plugin not loading
- **Solution:** Run `npm run build` to compile TypeScript
- Verify `code.js` exists
- Reimport plugin manifest in Figma

## 📝 License

This project uses The Movie Database (TMDB) API. You must comply with their [terms of service](https://www.themoviedb.org/terms-of-use).

---

**Created with ❤️ using Figma Plugin API and TMDB**
