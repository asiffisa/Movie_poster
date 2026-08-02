// Movie Poster Finder — Figma plugin controller

const TMDB_PROXY_URL = "__TMDB_PROXY_URL__";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
const DEFAULT_POSTER_SIZES = ["w92", "w154", "w185", "w342", "w500", "w780", "original"];

type MediaType = "movie" | "tv";
type SearchMode = MediaType | "person";
type DiscoveryRail = "trending-week" | "popular" | "upcoming" | "now-playing" | "top-rated";
type PosterTarget = RectangleNode | FrameNode;
type QueryParams = Record<string, string | undefined>;
const MAX_RAIL_ITEMS = 21;
const MAX_DETAIL_CACHE_ENTRIES = 60;

interface TmdbMedia {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  vote_average?: number;
  popularity?: number;
}

interface TmdbPerson {
  id: number;
  name?: string;
  profile_path?: string | null;
  known_for_department?: string;
}

interface TmdbListResponse<T> {
  page?: number;
  results?: T[];
  total_pages?: number;
}

interface TmdbGenre {
  id: number;
  name: string;
}

interface TmdbConfiguration {
  images?: {
    poster_sizes?: string[];
  };
}

interface TmdbCastMember {
  name?: string;
  character?: string;
  profile_path?: string | null;
}

interface TmdbPoster {
  file_path?: string;
  iso_639_1?: string | null;
  vote_average?: number;
}

interface TmdbImagesResponse {
  posters?: TmdbPoster[];
}

interface TmdbDetails extends TmdbMedia {
  genres?: TmdbGenre[];
  tagline?: string;
  runtime?: number;
  episode_run_time?: number[];
  credits?: { cast?: TmdbCastMember[] };
  images?: { posters?: TmdbPoster[] };
  recommendations?: TmdbListResponse<TmdbMedia>;
}

interface PosterItem {
  itemType: "media";
  id: number;
  mediaType: MediaType;
  title: string;
  year: string;
  posterPath: string;
  thumbnailUrl: string;
  overview: string;
  rating: number | null;
  // These aliases keep the established UI contract intact while the controller
  // also exposes clearer camelCase fields for future UI additions.
  poster_path: string;
  poster_full: string;
  release_date?: string;
  first_air_date?: string;
}

interface PersonItem {
  itemType: "person";
  id: number;
  name: string;
  profilePath: string | null;
  thumbnailUrl: string | null;
  knownFor: string;
}

interface DetailPayload {
  id: number;
  mediaType: MediaType;
  title: string;
  year: string;
  posterPath: string | null;
  overview: string;
  tagline: string;
  rating: number | null;
  runtime: number | null;
  genres: string[];
  cast: Array<{ name: string; character: string }>;
  posters: Array<{ path: string; thumbnailUrl: string; language: string; score: number }>;
  recommendations: PosterItem[];
}

type UiMessage =
  | { type: "ui-ready" }
  | { type: "get-trending"; mediaType?: string; rail?: string }
  | { type: "live-search"; mode?: string; mediaType?: string; query?: string }
  | { type: "search"; mode?: string; mediaType?: string; query?: string }
  | { type: "clear-search" }
  | { type: "random-pick"; mediaType?: string }
  | { type: "insert-poster"; posterPath?: string; title?: string }
  | { type: "get-poster-alternatives"; mediaType?: string; id?: number }
  | { type: "get-details"; mediaType?: string; id?: number }
  | { type: "get-person-credits"; personId?: number; name?: string }
  | { type: "insert-template"; mediaType?: string; id?: number; posterPath?: string }
  | { type: "close" };

figma.showUI(__html__, { width: 460, height: 760 });

const ui = (message: unknown): void => figma.ui.postMessage(message);
const snack = (message: string): void => ui({ type: "snackbar", message });

let posterSizes = [...DEFAULT_POSTER_SIZES];
let bootstrapPromise: Promise<void> | null = null;
let searchSerial = 0;
let trendingSerial = 0;
const detailsCache = new Map<string, DetailPayload>();
const posterAlternativesCache = new Map<string, string[]>();

function configuredProxyUrl(): string | null {
  // String() deliberately widens the build-time placeholder type. setup.js
  // replaces it with the public Worker URL in the generated plugin bundle.
  const configuredValue = String(TMDB_PROXY_URL);
  if (!configuredValue || configuredValue === "__TMDB_PROXY_URL__") return null;
  const normalized = configuredValue.replace(/\/+$/, "");
  const isHttps = /^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(normalized);
  const isLocalDevelopment = /^http:\/\/localhost(?::\d+)?(?:\/[^\s]*)?$/i.test(normalized);
  return isHttps || isLocalDevelopment ? normalized : null;
}

function ensureProxy(): string {
  const proxyUrl = configuredProxyUrl();
  if (!proxyUrl) {
    throw new Error("Proxy not configured. Add TMDB_PROXY_URL to .env after deploying the Cloudflare Worker.");
  }
  return proxyUrl;
}

function normalizeMediaType(value: string | undefined): MediaType {
  return value === "tv" ? "tv" : "movie";
}

function normalizeSearchMode(value: string | undefined): SearchMode {
  if (value === "tv" || value === "person") return value;
  return "movie";
}

function normalizeDiscoveryRail(value: string | undefined): DiscoveryRail {
  const rails: DiscoveryRail[] = ["trending-week", "popular", "upcoming", "now-playing", "top-rated"];
  return rails.indexOf(value as DiscoveryRail) >= 0 ? value as DiscoveryRail : "trending-week";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function valueOrEmpty(value: string | undefined | null): string {
  return value || "";
}

function yearFrom(media: TmdbMedia): string {
  return (media.release_date || media.first_air_date || "").slice(0, 4);
}

function imageUrl(path: string, size: string): string {
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

function previewPosterSize(): string {
  if (posterSizes.indexOf("w185") >= 0) return "w185";
  const available = posterSizes
    .filter((size) => /^w\d+$/.test(size))
    .map((size) => Number(size.slice(1)))
    .filter((size) => size <= 342)
    .sort((a, b) => b - a);
  return available.length ? `w${available[0]}` : "w185";
}

function fallbackPosterSize(): string {
  const available = posterSizes
    .filter((size) => /^w\d+$/.test(size))
    .map((size) => Number(size.slice(1)))
    .sort((a, b) => b - a);
  return available.length ? `w${available[0]}` : "w780";
}

function toPosterItem(media: TmdbMedia, mediaType: MediaType): PosterItem | null {
  const posterPath = media.poster_path;
  if (!posterPath) return null;
  return {
    itemType: "media",
    id: media.id,
    mediaType,
    title: media.title || media.name || "Untitled",
    year: yearFrom(media),
    posterPath,
    thumbnailUrl: imageUrl(posterPath, previewPosterSize()),
    overview: media.overview || "",
    rating: typeof media.vote_average === "number" ? media.vote_average : null,
    poster_path: posterPath,
    poster_full: imageUrl(posterPath, previewPosterSize()),
    release_date: media.release_date,
    first_air_date: media.first_air_date
  };
}

function toPersonItem(person: TmdbPerson): PersonItem {
  return {
    itemType: "person",
    id: person.id,
    name: person.name || "Unknown person",
    profilePath: person.profile_path || null,
    thumbnailUrl: person.profile_path ? imageUrl(person.profile_path, "w185") : null,
    knownFor: person.known_for_department || "Actor"
  };
}

function serializeQuery(params: QueryParams): string {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== "")
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key] as string)}`)
    .join("&");
}

async function fetchJson<T>(path: string, params: QueryParams = {}): Promise<T> {
  const proxyUrl = ensureProxy();
  const query = serializeQuery(params);
  const url = `${proxyUrl}/tmdb${path}${query ? `?${query}` : ""}`;

  const response = await fetch(url);
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: string; status_message?: string };
      detail = body.error || body.status_message || "";
    } catch {
      // A response body is optional for an HTTP error.
    }
    throw new Error(detail || `Request failed (HTTP ${response.status}).`);
  }
  return (await response.json()) as T;
}

async function initialise(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = Promise.all([
    fetchJson<TmdbConfiguration>("/configuration")
  ])
    .then(([configuration]) => {
      const configuredSizes = configuration.images?.poster_sizes?.filter((size) => typeof size === "string");
      if (configuredSizes?.length) posterSizes = configuredSizes;
    })
    .catch((error: unknown) => {
      bootstrapPromise = null;
      ui({ type: "error", message: errorMessage(error) });
      throw error;
    });

  return bootstrapPromise;
}

function getOrCreateTargetNode(): PosterTarget | null {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    const node = figma.createRectangle();
    node.name = "Movie Poster";
    node.resize(200, 300);
    node.x = figma.viewport.center.x - 100;
    node.y = figma.viewport.center.y - 150;
    figma.currentPage.selection = [node];
    return node;
  }

  if (selection.length === 1 && (selection[0].type === "RECTANGLE" || selection[0].type === "FRAME")) {
    return selection[0];
  }

  ui({ type: "no-selection", message: "Select a frame or rectangle to add a poster." });
  return null;
}

async function createImageFromUrl(url: string): Promise<Image> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Poster download failed (HTTP ${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("Poster download was empty.");
  return figma.createImage(bytes);
}

async function applyPoster(node: PosterTarget, posterPath: string): Promise<void> {
  try {
    const original = await createImageFromUrl(imageUrl(posterPath, "original"));
    node.fills = [{ type: "IMAGE", imageHash: original.hash, scaleMode: "FILL" }];
  } catch (originalError) {
    const fallbackSize = fallbackPosterSize();
    if (fallbackSize === "original") throw originalError;
    const fallback = await createImageFromUrl(imageUrl(posterPath, fallbackSize));
    node.fills = [{ type: "IMAGE", imageHash: fallback.hash, scaleMode: "FILL" }];
  }
}

async function insertPoster(posterPath: string, title: string): Promise<void> {
  const destination = figma.currentPage.selection.length === 1 ? "figma frame" : "figma canvas";
  const node = getOrCreateTargetNode();
  if (!node) return;
  await applyPoster(node, posterPath);
  ui({ type: "inserted", message: `Added ${title} to ${destination}` });
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function railEndpoint(mediaType: MediaType, rail: DiscoveryRail): { path: string; seedMediaType: MediaType; params?: QueryParams } {
  if (rail === "trending-week") return { path: `/trending/${mediaType}/week`, seedMediaType: mediaType };

  const today = todayIsoDate();
  const endpoints: Record<Exclude<DiscoveryRail, "trending-week">, { path: string; params?: QueryParams }> = {
    popular: { path: mediaType === "movie" ? "/movie/popular" : "/tv/popular" },
    upcoming: mediaType === "movie"
      ? { path: "/discover/movie", params: { include_adult: "false", include_video: "false", sort_by: "primary_release_date.asc", "primary_release_date.gte": today } }
      : { path: "/discover/tv", params: { include_adult: "false", sort_by: "first_air_date.asc", "first_air_date.gte": today } },
    "now-playing": { path: mediaType === "movie" ? "/movie/now_playing" : "/tv/airing_today" },
    "top-rated": { path: mediaType === "movie" ? "/movie/top_rated" : "/tv/top_rated" }
  };
  return { ...endpoints[rail], seedMediaType: mediaType };
}

async function fetchTrending(mediaType: MediaType, rail: DiscoveryRail): Promise<void> {
  const serial = ++trendingSerial;
  const endpoint = railEndpoint(mediaType, rail);

  try {
    const firstPageParams: QueryParams = { language: "en-US", page: "1", ...(endpoint.params || {}) };
    const firstPage = await fetchJson<TmdbListResponse<TmdbMedia>>(
      endpoint.path,
      firstPageParams
    );
    let results = firstPage.results || [];
    if (results.length >= 20 && (firstPage.total_pages || 1) > 1) {
      const secondPage = await fetchJson<TmdbListResponse<TmdbMedia>>(endpoint.path, { ...firstPageParams, page: "2" });
      results = [...results, ...(secondPage.results || [])];
    }
    if (rail === "upcoming") {
      const dateField = mediaType === "movie" ? "release_date" : "first_air_date";
      const minimumDate = endpoint.params && (endpoint.params["primary_release_date.gte"] || endpoint.params["first_air_date.gte"]);
      results = results.filter((media) => Boolean(media[dateField]) && (media[dateField] as string) >= (minimumDate || todayIsoDate()));
    }
    if (serial !== trendingSerial) return;
    const seenIds = new Set<number>();
    const items = results
      .filter((media) => {
        if (seenIds.has(media.id)) return false;
        seenIds.add(media.id);
        return true;
      })
      .map((media) => toPosterItem(media, endpoint.seedMediaType))
      .filter((item): item is PosterItem => item !== null)
      .slice(0, MAX_RAIL_ITEMS);
    ui({ type: "trending-results", items, results: items, mediaType, rail });
  } catch (error) {
    if (serial === trendingSerial) {
      ui({ type: "error", message: errorMessage(error) });
      ui({ type: "trending-results", items: [], results: [], mediaType, rail });
    }
  }
}

async function performSearch(mode: SearchMode, query: string): Promise<void> {
  const trimmedQuery = query.trim();
  const serial = ++searchSerial;

  if (trimmedQuery.length < 1) {
    ui({ type: "search-results", items: [], results: [], query: trimmedQuery, mode });
    return;
  }

  try {
    if (mode === "person") {
      const response = await fetchJson<TmdbListResponse<TmdbPerson>>(
        "/search/person",
        { query: trimmedQuery, include_adult: "false", language: "en-US", page: "1" }
      );
      if (serial !== searchSerial) return;
      const people = (response.results || []).slice(0, MAX_RAIL_ITEMS).map(toPersonItem);
      ui({ type: "search-results", items: people, results: people, query: trimmedQuery, mode });
      return;
    }

    const response = await fetchJson<TmdbListResponse<TmdbMedia>>(
      `/search/${mode}`,
      { query: trimmedQuery, include_adult: "false", language: "en-US", page: "1" }
    );
    if (serial !== searchSerial) return;
    const items = (response.results || [])
      .map((media) => toPosterItem(media, mode))
      .filter((item): item is PosterItem => item !== null)
      .slice(0, MAX_RAIL_ITEMS);
    ui({ type: "search-results", items, results: items, query: trimmedQuery, mode });
  } catch (error) {
    if (serial === searchSerial) {
      ui({ type: "error", message: errorMessage(error) });
      ui({ type: "search-results", items: [], results: [], query: trimmedQuery, mode });
    }
  }
}

async function randomPick(mediaType: MediaType): Promise<void> {
  const params: QueryParams = {
    include_adult: "false",
    language: "en-US",
    sort_by: "popularity.desc",
    "vote_average.gte": "7",
    "vote_count.gte": "50"
  };

  try {
    const firstPage = await fetchJson<TmdbListResponse<TmdbMedia>>(`/discover/${mediaType}`, params);
    const totalPages = Math.max(1, Math.min(firstPage.total_pages || 1, 500));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      params.page = String(Math.floor(Math.random() * totalPages) + 1);
      const page = await fetchJson<TmdbListResponse<TmdbMedia>>(`/discover/${mediaType}`, params);
      const candidates = (page.results || [])
        .map((media) => toPosterItem(media, mediaType))
        .filter((item): item is PosterItem => item !== null);
      if (!candidates.length) continue;
      const candidate = candidates[Math.floor(Math.random() * candidates.length)];
      await insertPoster(candidate.posterPath, candidate.title);
      return;
    }
    snack("No suitable poster was found. Try again.");
  } catch (error) {
    ui({ type: "error", message: errorMessage(error) });
  }
}

function detailCacheKey(mediaType: MediaType, id: number): string {
  return `${mediaType}:${id}`;
}

function cacheDetail<T>(cache: Map<string, T>, key: string, value: T): void {
  if (!cache.has(key) && cache.size >= MAX_DETAIL_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
}

async function getPosterAlternatives(mediaType: MediaType, id: number): Promise<string[]> {
  const cacheKey = detailCacheKey(mediaType, id);
  const cached = posterAlternativesCache.get(cacheKey);
  if (cached) return cached;

  const images = await fetchJson<TmdbImagesResponse>(`/${mediaType}/${id}/images`);
  const seen = new Set<string>();
  const paths = (images.posters || [])
    .filter((poster): poster is TmdbPoster & { file_path: string } => Boolean(poster.file_path))
    .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
    .map((poster) => poster.file_path)
    .filter((path) => {
      if (seen.has(path)) return false;
      seen.add(path);
      return true;
    });
  cacheDetail(posterAlternativesCache, cacheKey, paths);
  return paths;
}

async function sendPosterAlternatives(mediaType: MediaType, id: number): Promise<void> {
  try {
    const posterPaths = await getPosterAlternatives(mediaType, id);
    ui({ type: "poster-alternatives", mediaType, id, posterPaths });
  } catch (error) {
    // This request happens on hover, so leave the card unchanged rather than
    // interrupting the user with an error when TMDB has no image data.
    console.warn("Poster alternatives could not be loaded", error);
    ui({ type: "poster-alternatives", mediaType, id, posterPaths: [] });
  }
}

async function getDetails(mediaType: MediaType, id: number): Promise<DetailPayload> {
  const cacheKey = detailCacheKey(mediaType, id);
  const cached = detailsCache.get(cacheKey);
  if (cached) return cached;

  const detail = await fetchJson<TmdbDetails>(
    `/${mediaType}/${id}`,
    {
      language: "en-US",
      append_to_response: "credits,images,recommendations",
      include_image_language: "en,null"
    }
  );
  const posters = (detail.images?.posters || [])
    .filter((poster): poster is TmdbPoster & { file_path: string } => Boolean(poster.file_path))
    .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
    .slice(0, 12)
    .map((poster) => ({
      path: poster.file_path,
      thumbnailUrl: imageUrl(poster.file_path, previewPosterSize()),
      language: poster.iso_639_1 || "No text",
      score: poster.vote_average || 0
    }));
  const recommendations = (detail.recommendations?.results || [])
    .map((item) => toPosterItem(item, mediaType))
    .filter((item): item is PosterItem => item !== null)
    .slice(0, 6);
  const payload: DetailPayload = {
    id,
    mediaType,
    title: detail.title || detail.name || "Untitled",
    year: yearFrom(detail),
    posterPath: detail.poster_path || null,
    overview: detail.overview || "No overview is available.",
    tagline: detail.tagline || "",
    rating: typeof detail.vote_average === "number" ? detail.vote_average : null,
    runtime: detail.runtime || detail.episode_run_time?.[0] || null,
    genres: (detail.genres || []).map((genre) => genre.name),
    cast: (detail.credits?.cast || []).slice(0, 6).map((member) => ({
      name: member.name || "Unknown",
      character: member.character || ""
    })),
    posters,
    recommendations
  };
  cacheDetail(detailsCache, cacheKey, payload);
  return payload;
}

async function sendDetails(mediaType: MediaType, id: number): Promise<void> {
  try {
    ui({ type: "details", detail: await getDetails(mediaType, id) });
  } catch (error) {
    ui({ type: "error", message: errorMessage(error) });
  }
}

async function getPersonCredits(personId: number, name: string): Promise<void> {
  try {
    const [movieCredits, tvCredits] = await Promise.all([
      fetchJson<{ cast?: TmdbMedia[] }>(`/person/${personId}/movie_credits`, { language: "en-US" }),
      fetchJson<{ cast?: TmdbMedia[] }>(`/person/${personId}/tv_credits`, { language: "en-US" })
    ]);
    const seen = new Set<string>();
    const items = [...(movieCredits.cast || []).map((item) => ({ item, mediaType: "movie" as const })), ...
      (tvCredits.cast || []).map((item) => ({ item, mediaType: "tv" as const }))]
      .sort((a, b) => (b.item.popularity || 0) - (a.item.popularity || 0))
      .map(({ item, mediaType }) => toPosterItem(item, mediaType))
      .filter((item): item is PosterItem => {
        if (!item || seen.has(`${item.mediaType}:${item.id}`)) return false;
        seen.add(`${item.mediaType}:${item.id}`);
        return true;
      })
      .slice(0, 24);
    ui({ type: "person-credits", items, name });
  } catch (error) {
    ui({ type: "error", message: errorMessage(error) });
  }
}

async function createTextNode(value: string, size: number, fontStyle: "Regular" | "Semi Bold", color: RGB): Promise<TextNode> {
  const node = figma.createText();
  node.fontName = { family: "Inter", style: fontStyle };
  node.fontSize = size;
  node.fills = [{ type: "SOLID", color }];
  node.characters = value;
  node.textAutoResize = "HEIGHT";
  return node;
}

async function insertTemplate(mediaType: MediaType, id: number, chosenPosterPath?: string): Promise<void> {
  const detail = await getDetails(mediaType, id);
  const posterPath = chosenPosterPath || detail.posterPath;
  if (!posterPath) throw new Error("This title has no poster to insert.");

  await Promise.all([
    figma.loadFontAsync({ family: "Inter", style: "Regular" }),
    figma.loadFontAsync({ family: "Inter", style: "Semi Bold" })
  ]);

  const card = figma.createFrame();
  card.name = `Poster Card — ${detail.title}`;
  card.layoutMode = "HORIZONTAL";
  card.primaryAxisSizingMode = "FIXED";
  card.counterAxisSizingMode = "FIXED";
  card.resize(740, 480);
  card.paddingLeft = 24;
  card.paddingRight = 24;
  card.paddingTop = 24;
  card.paddingBottom = 24;
  card.itemSpacing = 28;
  card.cornerRadius = 20;
  card.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  card.x = figma.viewport.center.x - card.width / 2;
  card.y = figma.viewport.center.y - card.height / 2;

  const poster = figma.createRectangle();
  poster.name = `${detail.title} poster`;
  poster.resize(288, 432);
  poster.cornerRadius = 12;
  card.appendChild(poster);
  await applyPoster(poster, posterPath);

  const copy = figma.createFrame();
  copy.name = "Movie details";
  copy.layoutMode = "VERTICAL";
  copy.primaryAxisSizingMode = "FIXED";
  copy.counterAxisSizingMode = "FIXED";
  copy.resize(376, 432);
  copy.itemSpacing = 12;
  copy.fills = [];
  card.appendChild(copy);

  const title = await createTextNode(detail.title, 28, "Semi Bold", { r: 0.07, g: 0.07, b: 0.07 });
  title.resize(376, 68);
  copy.appendChild(title);

  const facts = [detail.year, detail.genres.slice(0, 2).join(" · "), detail.rating ? `★ ${detail.rating.toFixed(1)}` : ""]
    .filter(Boolean)
    .join("  •  ");
  const metadata = await createTextNode(facts, 14, "Regular", { r: 0.35, g: 0.31, b: 0.4 });
  metadata.resize(376, 24);
  copy.appendChild(metadata);

  const overview = await createTextNode(detail.overview.slice(0, 260), 14, "Regular", { r: 0.18, g: 0.16, b: 0.2 });
  overview.resize(376, 160);
  copy.appendChild(overview);

  if (detail.cast.length) {
    const castLabel = await createTextNode(
      `Cast: ${detail.cast.map((member) => member.name).join(", ")}`,
      13,
      "Regular",
      { r: 0.35, g: 0.31, b: 0.4 }
    );
    castLabel.resize(376, 56);
    copy.appendChild(castLabel);
  }

  figma.currentPage.selection = [card];
  figma.viewport.scrollAndZoomIntoView([card]);
  ui({ type: "inserted", message: `Added an editable poster card for ${detail.title}` });
}

figma.ui.onmessage = async (rawMessage: unknown): Promise<void> => {
  const message = rawMessage as UiMessage;
  try {
    switch (message.type) {
      case "ui-ready":
        await initialise();
        return;
      case "get-trending":
        await fetchTrending(
          normalizeMediaType(message.mediaType),
          normalizeDiscoveryRail(message.rail)
        );
        return;
      case "live-search":
      case "search":
        await performSearch(normalizeSearchMode(message.mode || message.mediaType), valueOrEmpty(message.query));
        return;
      case "clear-search":
        searchSerial += 1;
        return;
      case "random-pick":
        await randomPick(normalizeMediaType(message.mediaType));
        return;
      case "insert-poster":
        if (!message.posterPath) throw new Error("Poster is not available.");
        await insertPoster(message.posterPath, message.title || "poster");
        return;
      case "get-poster-alternatives":
        if (typeof message.id !== "number") return;
        await sendPosterAlternatives(normalizeMediaType(message.mediaType), message.id);
        return;
      case "get-details":
        if (typeof message.id !== "number") throw new Error("Title details are unavailable.");
        await sendDetails(normalizeMediaType(message.mediaType), message.id);
        return;
      case "get-person-credits":
        if (typeof message.personId !== "number") throw new Error("Actor details are unavailable.");
        await getPersonCredits(message.personId, message.name || "this actor");
        return;
      case "insert-template":
        if (typeof message.id !== "number") throw new Error("Poster card details are unavailable.");
        await insertTemplate(normalizeMediaType(message.mediaType), message.id, message.posterPath);
        return;
      case "close":
        figma.closePlugin();
        return;
      default:
        return;
    }
  } catch (error) {
    console.error("Plugin action failed", error);
    ui({ type: "error", message: errorMessage(error) });
  }
};
