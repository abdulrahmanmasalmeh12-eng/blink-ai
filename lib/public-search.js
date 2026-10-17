const API_URL = "https://en.wikipedia.org/w/api.php";
const CACHE_TTL = 6 * 60 * 60 * 1000;
const cache = new Map();

async function searchWikipedia(query, fetchImpl = globalThis.fetch) {
  const searchText = String(query || "").trim().replace(/\s+/g, " ").slice(0, 240);
  if (!searchText) return null;
  const cacheKey = searchText.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: searchText,
    gsrnamespace: "0",
    gsrlimit: "3",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    exchars: "1500",
    format: "json",
    origin: "*"
  });

  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json", "user-agent": "BlinkAi/1.0 (independent local-first chat app)" },
      signal: AbortSignal.timeout(4500)
    });
    if (!response.ok) return null;
    const data = await response.json();
    const pages = Object.values(data.query?.pages || {}).sort((left, right) => left.index - right.index);
    const page = pages.find((item) => Number.isInteger(Number(item.pageid)) && Number(item.pageid) > 0 && item.extract?.trim());
    const fullExtract = String(page?.extract || "").replace(/\s+/g, " ").trim();
    const shortenedExtract = fullExtract.slice(0, 1100);
    const sentenceEnds = [...shortenedExtract.matchAll(/[.!?](?=\s+[A-Z0-9])/g)];
    const sentenceEnd = sentenceEnds.at(-1)?.index ?? -1;
    const excerpt = fullExtract.length <= 1100 ? fullExtract : sentenceEnd > 400 ? shortenedExtract.slice(0, sentenceEnd + 1) : shortenedExtract.slice(0, shortenedExtract.lastIndexOf(" "));
    const result = page ? {
      title: String(page.title).slice(0, 160),
      extract: excerpt,
      url: `https://en.wikipedia.org/?curid=${Number(page.pageid)}`
    } : null;
    cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return result;
  } catch {
    return null;
  }
}

module.exports = { searchWikipedia };
