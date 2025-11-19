// ===== Poster Finder — code.js (optimized) =====
// Put your TMDB v3 API KEY here
const TMDB_KEY = "__TMDB_API_KEY__"; // <-- replace with your v3 key
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

figma.showUI(__html__, { width: 440, height: 720 });

function ui(msg) { figma.ui.postMessage(msg); }
function snack(message) { ui({ type: "snackbar", message }); }

if (!TMDB_KEY || TMDB_KEY === "__TMDB_API_KEY__") {
  console.warn("Warning: TMDB key missing or placeholder. Set TMDB_KEY in code.js for network features.");
}

// ---------- HELPERS ----------

// fetch helper with better error handling
async function safeJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    console.error(`Fetch error for ${url}:`, e);
    throw e;
  }
}

// helper: fetch poster and return data URL (attempt)
async function fetchPosterAsDataUrl(posterPath) {
  if (!posterPath) return null;
  const full = TMDB_IMG + posterPath;
  try {
    const r = await fetch(full);
    if (!r.ok) throw new Error('img-http-' + r.status);
    const buf = await r.arrayBuffer();
    // Buffer is available in plugin main; convert to base64
    const base64 = Buffer.from(buf).toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch (e) {
    console.warn('poster fetch->dataurl failed', e, full);
    return null;
  }
}

// Helper: Get or create target node
function getOrCreateTargetNode() {
  const sel = figma.currentPage.selection;

  if (sel.length === 0) {
    // No selection: create a new rectangle
    const node = figma.createRectangle();
    node.resize(200, 300); // Default poster size
    // Center in viewport
    const center = figma.viewport.center;
    node.x = center.x - 100;
    node.y = center.y - 150;
    figma.currentPage.appendChild(node);
    figma.currentPage.selection = [node];
    return node;
  }

  if (sel.length === 1) {
    const node = sel[0];
    if ("fills" in node) {
      return node;
    } else {
      ui({ type: 'no-selection', message: 'Selected item cannot have fills' });
      return null;
    }
  }

  ui({ type: 'no-selection', message: 'Select only one frame or nothing to create new' });
  return null;
}

// ---------- SEARCH ----------
// Combined search function for both live and manual search
let latestSearchSerial = 0;

async function performSearch(mediaType, query, isLive = false) {
  // ignore empty queries
  if (!query || query.trim().length < 1) {
    ui({ type: "search-results", results: [], query });
    return;
  }

  const serial = ++latestSearchSerial;
  const type = mediaType === "tv" ? "tv" : "movie";
  const q = encodeURIComponent(query);
  const url = `${TMDB_BASE}/search/${type}?api_key=${TMDB_KEY}&query=${q}&page=1`;

  try {
    const json = await safeJson(url);

    // if this was a live search and another newer search started, discard this response
    if (isLive && serial !== latestSearchSerial) return;

    const raw = (json.results || []).slice(0, 9);
    const thumbLimit = 9;

    const items = await Promise.all(raw.map(async (it, idx) => {
      if (!it) return null;
      const poster_path = it.poster_path || null;
      let poster_full = null;

      // Try to fetch data URL for immediate display
      if (poster_path && idx < thumbLimit) {
        poster_full = await fetchPosterAsDataUrl(poster_path);
      }
      // Fallback to URL
      poster_full = poster_full || (poster_path ? (TMDB_IMG + poster_path) : null);

      return {
        id: it.id,
        title: it.title || it.name || "",
        year: (it.release_date || it.first_air_date || "").slice(0, 4),
        poster_path,
        poster_full
      };
    }));

    ui({ type: "search-results", results: items.filter(Boolean), query });
  } catch (err) {
    // only show network error if still the latest serial (for live search)
    if (!isLive || serial === latestSearchSerial) {
      console.error("Search error", err);
      ui({ type: "search-results", results: [], query });
      snack("Network error");
    }
  }
}

// ---------- TRENDING (top 12) ----------
async function fetchTrending(mediaType) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const url = `${TMDB_BASE}/trending/${type}/day?api_key=${TMDB_KEY}`;
  try {
    const json = await safeJson(url);
    const raw = json.results || [];
    const limit = 12;

    // fetch thumbnails in parallel but capped
    const candidates = raw.filter(i => i && i.poster_path).slice(0, limit);

    const results = await Promise.all(candidates.map(async (item) => {
      const dataUrl = await fetchPosterAsDataUrl(item.poster_path);
      return {
        id: item.id,
        title: item.title || item.name || "",
        year: (item.release_date || item.first_air_date || "").slice(0, 4),
        poster_path: item.poster_path,
        poster_full: dataUrl || (TMDB_IMG + item.poster_path)
      };
    }));

    ui({ type: "trending-results", results });
  } catch (err) {
    console.error("Trending fetch error:", err);
    snack("Network error");
    ui({ type: "trending-results", results: [] });
  }
}

// ---------- INSERT poster ----------
async function insertPoster(node, posterUrl, label = "") {
  if (!posterUrl) { snack("No poster URL"); return; }

  async function fetchImage(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Image fetch failed: ${r.status}`);
    const buf = await r.arrayBuffer();
    return new Uint8Array(buf);
  }

  try {
    let data;
    if (typeof posterUrl === 'string' && posterUrl.startsWith("data:")) {
      const base64 = posterUrl.split(',')[1];
      const raw = Buffer.from(base64, 'base64');
      data = new Uint8Array(raw);
    } else {
      data = await fetchImage(posterUrl);
    }

    const image = figma.createImage(data);
    const imageFill = { type: "IMAGE", imageHash: String(image.hash), scaleMode: "FILL" };

    try {
      node.fills = [imageFill];
      return;
    } catch (e) {
      console.warn("direct fill failed, fallback rectangle", e);
      // If we can't fill the node (e.g. it's a group), try to append a rect
      const rect = figma.createRectangle();
      rect.resize(node.width || 100, node.height || 100);
      rect.fills = [imageFill];
      try {
        if (typeof node.appendChild === "function") {
          node.appendChild(rect);
          rect.x = 0; rect.y = 0;
        } else {
          figma.currentPage.appendChild(rect);
        }
        return;
      } catch (appendErr) {
        console.error("fallback append failed:", appendErr);
        snack("Error inserting poster");
      }
    }
  } catch (finalErr) {
    console.error("insertPoster error:", finalErr);
    snack("Error inserting poster");
  }
}

// ---------- RANDOM PICK ----------
async function randomPick(mediaType) {
  const node = getOrCreateTargetNode();
  if (!node) return; // Error message already handled in helper

  const type = mediaType === "tv" ? "tv" : "movie";
  const MIN_VOTE_AVG = 7.0;
  const MIN_VOTE_COUNT = 50;
  const discoverBase = `${TMDB_BASE}/discover/${type}?api_key=${TMDB_KEY}&sort_by=popularity.desc&vote_average.gte=${MIN_VOTE_AVG}&vote_count.gte=${MIN_VOTE_COUNT}`;

  try {
    // 1. Get total pages first (cached if possible, but simple fetch here)
    const info = await safeJson(discoverBase + "&page=1");
    let totalPages = info.total_pages || 1;
    const MAX_PAGES = 500; // Limit to top 500 pages for relevance
    if (totalPages > MAX_PAGES) totalPages = MAX_PAGES;

    // 2. Try up to 3 times to find a valid page with results
    const MAX_ATTEMPTS = 3;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const page = Math.floor(Math.random() * totalPages) + 1;
      let pageJson;
      try {
        pageJson = await safeJson(discoverBase + `&page=${page}`);
      } catch (e) {
        console.warn("discover page failed", e);
        continue;
      }

      // 3. Filter ALL valid items on this page
      const validItems = (pageJson.results || []).filter(it =>
        it &&
        it.poster_path &&
        (Number(it.vote_average) >= MIN_VOTE_AVG) // Double check
      );

      if (validItems.length === 0) continue;

      // 4. Pick one random item from the valid list
      const candidate = validItems[Math.floor(Math.random() * validItems.length)];

      const posterUrl = TMDB_IMG + candidate.poster_path;
      await insertPoster(node, posterUrl, candidate.title || candidate.name);
      ui({ type: "inserted", message: `Added: ${candidate.title || candidate.name}` });
      return;
    }

    snack("Could not find a poster matching the constraints");
  } catch (err) {
    console.error("randomPick error:", err);
    snack("Network error during random pick");
  }
}

// ---------- message handler ----------
figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === "live-search") return performSearch(msg.mediaType, msg.query, true);
    if (msg.type === "search") return performSearch(msg.mediaType, msg.query, false);
    if (msg.type === "get-trending") return fetchTrending(msg.mediaType);

    if (msg.type === "insert-poster") {
      const node = getOrCreateTargetNode();
      if (!node) return;

      if (!msg.posterPath) {
        snack('Poster not available for this item');
        return;
      }
      const posterUrl = TMDB_IMG + msg.posterPath;
      await insertPoster(node, posterUrl, msg.title || "");
      ui({ type: 'inserted', message: `Added: ${msg.title || ""}` });
      return;
    }

    if (msg.type === "random-pick") {
      return randomPick(msg.mediaType);
    }
  } catch (err) {
    console.error("Plugin message error:", err);
    snack("Plugin error");
  }
};