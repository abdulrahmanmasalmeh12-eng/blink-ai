const test = require("node:test");
const assert = require("node:assert/strict");
const { searchContext } = require("../lib/retrieval");
const { searchWikipedia } = require("../lib/public-search");

const guides = [
  { title: "Debugging code", keywords: ["bug", "error", "stack", "trace"], text: "Reproduce the problem with a small input. Read the error and stack trace, isolate the failing line, and change one thing at a time." },
  { title: "Planning a project", keywords: ["goal", "tasks", "schedule"], text: "Write the outcome you want, divide it into small tasks, and choose the first action you can complete." }
];

test("ranks a relevant guide for a question", () => {
  const results = searchContext("How do I reproduce a bug and inspect its stack trace?", guides);
  assert.equal(results[0]?.title, "Debugging code");
});

test("retrieves useful text from an uploaded note", () => {
  const results = searchContext("When does the east greenhouse open?", [
    ...guides,
    { title: "garden.md", kind: "upload", text: "The east greenhouse opens at 08:00. Basil seedlings need gentle watering." }
  ]);
  assert.equal(results[0]?.title, "garden.md");
  assert.match(results[0].text, /opens at 08:00/);
});

test("uses a saved memory when it matches the question", () => {
  const results = searchContext("What style of answers do I prefer?", [
    { title: "Saved preference", kind: "memory", text: "I prefer concise answers." },
    ...guides
  ]);
  assert.equal(results[0]?.kind, "memory");
});

test("does not invent a match for unrelated questions", () => {
  assert.deepEqual(searchContext("Explain interstellar propulsion physics", guides), []);
});

test("ignores queries made only of common words", () => {
  assert.deepEqual(searchContext("What is it?", guides), []);
});

test("returns a cited public reference when Wikipedia has a result", async () => {
  let requestedUrl;
  const result = await searchWikipedia("volcanic winter test topic", async (url) => {
    requestedUrl = new URL(url);
    return {
      ok: true,
      json: async () => ({ query: { pages: { 25: { pageid: 25, index: 1, title: "Volcanic winter", extract: "A period of reduced global temperatures." } } } })
    };
  });
  assert.equal(result.title, "Volcanic winter");
  assert.equal(result.url, "https://en.wikipedia.org/?curid=25");
  assert.equal(requestedUrl.searchParams.get("gsrsearch"), "volcanic winter test topic");
});

test("trims a long reference at a complete sentence", async () => {
  const extract = `${"This is a complete reference sentence. ".repeat(35)}This sentence should be cut off before it ends`;
  const result = await searchWikipedia("sentence-boundary-test-topic", async () => ({
    ok: true,
    json: async () => ({ query: { pages: { 26: { pageid: 26, index: 1, title: "Long reference", extract } } } })
  }));
  assert.ok(result.extract.length <= 1100);
  assert.match(result.extract, /\.$/);
  assert.doesNotMatch(result.extract, /should be cut off/);
});

test("returns no public reference when search has no pages", async () => {
  const result = await searchWikipedia("empty-result-test-topic", async () => ({ ok: true, json: async () => ({ query: { pages: {} } }) }));
  assert.equal(result, null);
});

test("fails closed when the public search is unavailable", async () => {
  const result = await searchWikipedia("network-failure-test-topic", async () => { throw new Error("offline"); });
  assert.equal(result, null);
});
