// ===== Poster Finder — code.ts =====

const TMDB_KEY = "__TMDB_API_KEY__" as string;
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

figma.showUI(__html__, { width: 440, height: 720 });

const ui = (msg: any) => figma.ui.postMessage(msg);
const snack = (message: string) => ui({ type: "snackbar", message });

if (!TMDB_KEY || TMDB_KEY === "__TMDB_API_KEY__") {
  console.warn("Warning: TMDB key missing.");
}

// ---------- HELPERS ----------

async function safeJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Get or create target node for poster insertion.
 * Prefers current selection if it can have fills.
 */
function getOrCreateTargetNode(): RectangleNode | FrameNode | null {
  const sel = figma.currentPage.selection;

  if (sel.length === 0) {
    const node = figma.createRectangle();
    node.name = "Movie Poster";
    node.resize(200, 300);
    const center = figma.viewport.center;
    node.x = center.x - 100;
    node.y = center.y - 150;
    figma.currentPage.appendChild(node);
    figma.currentPage.selection = [node];
    return node;
  }

  if (sel.length === 1) {
    const node = sel[0];
    if (node.type === "RECTANGLE" || node.type === "FRAME" || "fills" in node) {
      return node as RectangleNode | FrameNode;
    }
    ui({ type: 'no-selection', message: 'Selected item cannot have fills' });
    return null;
  }

  ui({ type: 'no-selection', message: 'Select only one frame or nothing' });
  return null;
}

// ---------- SEARCH & TRENDING ----------
let latestSearchSerial = 0;

async function performSearch(mediaType: string, query: string, isLive: boolean = false) {
  if (!query || query.trim().length < 1) {
    ui({ type: "search-results", results: [], query });
    return;
  }

  const serial = ++latestSearchSerial;
  const type = mediaType === "tv" ? "tv" : "movie";
  const url = `${TMDB_BASE}/search/${type}?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&page=1`;

  try {
    const json = await safeJson(url);
    if (isLive && serial !== latestSearchSerial) return;

    const raw = (json.results || []).slice(0, 9);
    const items = raw.map((it: any) => {
      if (!it) return null;
      const path = it.poster_path || null;
      return {
        id: it.id,
        title: it.title || it.name || "",
        year: (it.release_date || it.first_air_date || "").slice(0, 4),
        poster_path: path,
        poster_full: path ? (TMDB_IMG + path) : null
      };
    }).filter(Boolean);

    ui({ type: "search-results", results: items, query });
  } catch (err) {
    if (!isLive || serial === latestSearchSerial) {
      console.error("Search error", err);
      ui({ type: "search-results", results: [], query });
      snack("Network error");
    }
  }
}

async function fetchTrending(mediaType: string) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const url = `${TMDB_BASE}/trending/${type}/day?api_key=${TMDB_KEY}`;
  try {
    const json = await safeJson(url);
    const candidates = (json.results || []).filter((i: any) => i && i.poster_path).slice(0, 12);

    const results = candidates.map((item: any) => ({
      id: item.id,
      title: item.title || item.name || "",
      year: (item.release_date || item.first_air_date || "").slice(0, 4),
      poster_path: item.poster_path,
      poster_full: TMDB_IMG + item.poster_path
    }));

    ui({ type: "trending-results", results });
  } catch (err) {
    console.error("Trending fetch error:", err);
    snack("Network error");
    ui({ type: "trending-results", results: [] });
  }
}

// ---------- INSERTION LOGIC ----------

/**
 * Inserts the poster into the target node.
 * Uses Uint8Array data directly (preferred) or fetches from URL.
 */
async function insertPoster(node: RectangleNode | FrameNode, source: Uint8Array | string) {
  try {
    let data: Uint8Array;
    if (typeof source === "string") {
      // Fallback fetch if data wasn't pre-captured
      console.log("Fallback fetching from:", source);
      const res = await fetch(source);
      if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
      data = new Uint8Array(await res.arrayBuffer());
    } else {
      data = source;
    }

    if (data.length === 0) throw new Error("Image data is empty");

    const image = figma.createImage(data);
    const imageFill: ImagePaint = { type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" };

    // Standard fill update
    if ("fills" in node) {
      const currentFills = Array.isArray(node.fills) ? [...node.fills] : [];
      node.fills = [imageFill];
    }
  } catch (err) {
    console.error("insertPoster error:", err);
    snack("Error inserting poster");
  }
}

// ---------- RANDOM PICK ----------
async function randomPick(mediaType: string) {
  const node = getOrCreateTargetNode();
  if (!node) return;

  const type = mediaType === "tv" ? "tv" : "movie";
  const MIN_VOTE_AVG = 7.0;
  const MIN_VOTE_COUNT = 50;
  const discoverBase = `${TMDB_BASE}/discover/${type}?api_key=${TMDB_KEY}&sort_by=popularity.desc&vote_average.gte=${MIN_VOTE_AVG}&vote_count.gte=${MIN_VOTE_COUNT}`;

  try {
    const info = await safeJson(discoverBase + "&page=1");
    let totalPages = Math.min(info.total_pages || 1, 500);

    for (let i = 0; i < 3; i++) {
      const page = Math.floor(Math.random() * totalPages) + 1;
      let pageJson: any;
      try {
        pageJson = await safeJson(discoverBase + `&page=${page}`);
      } catch (_e) {
        continue;
      }

      const validItems = (pageJson.results || []).filter((it: any) =>
        it && it.poster_path && Number(it.vote_average) >= MIN_VOTE_AVG
      );
      if (validItems.length === 0) continue;

      const candidate = validItems[Math.floor(Math.random() * validItems.length)];
      ui({ 
        type: "fetch-for-random", 
        posterPath: candidate.poster_path, 
        title: candidate.title || candidate.name 
      });
      return;
    }

    snack("No suitable poster found");
  } catch (err) {
    console.error("randomPick error:", err);
    snack("Network error");
  }
}

// ---------- UI MESSAGE HANDLER ----------
figma.ui.onmessage = async (msg: any) => {
  try {
    switch (msg.type) {
      case "live-search":
        return performSearch(msg.mediaType, msg.query, true);
      case "search":
        return performSearch(msg.mediaType, msg.query, false);
      case "get-trending":
        return fetchTrending(msg.mediaType);
      case "random-pick":
        return randomPick(msg.mediaType);
      case "close":
        return figma.closePlugin();
      
      case "insert-poster": {
        const node = getOrCreateTargetNode();
        if (!node) return;
        
        if (msg.data instanceof Uint8Array) {
          await insertPoster(node, msg.data);
          ui({ type: 'inserted', message: `Added: ${msg.title || ""}` });
        } else if (msg.posterPath) {
          const url = TMDB_IMG + msg.posterPath;
          await insertPoster(node, url);
          ui({ type: 'inserted', message: `Added: ${msg.title || ""}` });
        } else {
          snack('Poster not available');
        }
        break;
      }
    }
  } catch (err) {
    console.error("Plugin message error:", err);
    snack("Action failed");
  }
};

