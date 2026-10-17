const STOP_WORDS = new Set("a an and are as at be been being but by can could did do does for from had has have he her here hers him his how i if in into is it its me my of on or our she should so that the their them then there these they this those through to too up us was we were what when where which who why will with would you your".split(" "));

function stem(word) {
  if (word.length > 5 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 5 && word.endsWith("ing")) {
    const base = word.slice(0, -3);
    return base.length > 2 && base.at(-1) === base.at(-2) ? base.slice(0, -1) : base;
  }
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function terms(text) {
  return (String(text || "").toLowerCase().match(/[a-z0-9']+/g) || [])
    .map(stem)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function chunksFor(source) {
  const sentences = (String(source.text || "").replace(/\s+/g, " ").match(/[^.!?]+[.!?]?/g) || []).map((sentence) => sentence.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    const next = `${current} ${sentence}`.trim();
    if (current && next.length > 460) {
      chunks.push(current);
      current = sentence.trim();
    } else current = next;
  }
  if (current) chunks.push(current);
  return chunks.flatMap((chunk) => chunk.length > 900 ? chunk.match(/.{1,900}(?:\s|$)/g).map((part) => part.trim()) : [chunk]);
}

function searchContext(query, sources, limit = 3) {
  const queryTerms = [...new Set(terms(query))];
  if (!queryTerms.length) return [];

  const documents = sources.flatMap((source) => chunksFor(source).map((text) => {
    const title = String(source.title || "Local note");
    const titleTerms = terms(`${title} ${(source.keywords || []).join(" ")}`);
    const tokens = terms(text);
    return { title, kind: source.kind || "guide", text, titleTerms, tokens, length: tokens.length };
  })).filter((document) => document.tokens.length);
  if (!documents.length) return [];

  const documentFrequency = new Map(queryTerms.map((term) => [term, 0]));
  for (const document of documents) {
    const unique = new Set(document.tokens);
    for (const term of queryTerms) if (unique.has(term)) documentFrequency.set(term, documentFrequency.get(term) + 1);
  }
  const averageLength = documents.reduce((total, document) => total + document.length, 0) / documents.length || 1;
  const ranked = documents.map((document) => {
    const frequencies = new Map();
    for (const term of document.tokens) frequencies.set(term, (frequencies.get(term) || 0) + 1);
    let score = 0;
    let matched = 0;
    for (const term of queryTerms) {
      const frequency = frequencies.get(term) || 0;
      if (!frequency) continue;
      matched += 1;
      const count = documentFrequency.get(term);
      const inverseFrequency = Math.log(1 + (documents.length - count + 0.5) / (count + 0.5));
      const lengthFactor = 1.2 * (0.25 + 0.75 * document.length / averageLength);
      score += inverseFrequency * (frequency * 2.2) / (frequency + lengthFactor);
      if (document.titleTerms.includes(term)) score += inverseFrequency * 0.7;
    }
    const coverage = matched / queryTerms.length;
    if (document.kind === "memory") score += 0.65;
    if (document.kind === "upload") score += 0.4;
    return { title: document.title, kind: document.kind, text: document.text, score, coverage };
  }).filter((document) => document.score >= 0.45 && document.coverage >= 0.3)
    .sort((left, right) => right.score - left.score);

  const seen = new Set();
  return ranked.filter((document) => {
    const key = `${document.kind}:${document.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

module.exports = { searchContext, terms };
