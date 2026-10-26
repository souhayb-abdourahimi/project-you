// Measures real Overpass answers (status, time, size, elements) for the old and the new nearby
// queries. Run from a machine that reaches the internet: node scripts/places/measure-overpass.mjs
// Polite: one request at a time, a pause between them, about 16 requests in total.
const UA = 'ProjectYou/1.0 (fitness and nutrition coach; nearby places search; measurement)';
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const POINTS = { paris: [48.857, 2.352], lyon: [45.764, 4.836] };

const GYM_SPORTS = 'fitness|weightlifting|crossfit|bodybuilding|powerlifting';
const OLD = {
  gym: (lat, lng, r) =>
    `[out:json][timeout:10];(nwr["leisure"="fitness_centre"](around:${r},${lat},${lng});nwr["amenity"="gym"](around:${r},${lat},${lng});nwr["leisure"="sports_centre"]["sport"~"${GYM_SPORTS}"](around:${r},${lat},${lng}););out center tags 250;`,
  store: (lat, lng, r) =>
    `[out:json][timeout:10];(${[
      'shop=supermarket',
      'shop=convenience',
      'shop=greengrocer',
      'shop=health_food',
      'amenity=marketplace',
    ]
      .map((kv) => kv.split('='))
      .map(([k, v]) => `nwr["${k}"="${v}"](around:${r},${lat},${lng});`)
      .join('')});out center tags 250;`,
};
async function newQuery(kind, lat, lng, r) {
  const { overpassQuery } = await import('../../supabase/functions/places-nearby/overpass.ts').catch(() => ({}));
  return overpassQuery ? overpassQuery(kind, { lat, lng }, r) : null;
}

async function run(endpoint, query) {
  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': UA },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let elements = '-';
    let remark = '';
    try {
      const json = JSON.parse(text);
      elements = json.elements?.length ?? '-';
      remark = json.remark ? String(json.remark).slice(0, 60) : '';
    } catch {
      remark = text.slice(0, 60).replace(/\s+/g, ' ');
    }
    return `${response.status} ${Date.now() - started} ms ${text.length} B ${elements} el ${remark}`;
  } catch (e) {
    return `ERR ${Date.now() - started} ms ${e.name}`;
  }
}

const pause = () => new Promise((r) => setTimeout(r, 1500));
for (const [city, [lat, lng]] of Object.entries(POINTS)) {
  for (const [kind, r] of [
    ['gym', 5000],
    ['store', 2000],
  ]) {
    for (const endpoint of ENDPOINTS) {
      const host = new URL(endpoint).host;
      console.log(`${city} ${kind} ${host} OLD: ${await run(endpoint, OLD[kind](lat, lng, r))}`);
      await pause();
      const q = await newQuery(kind, lat, lng, r);
      if (q) {
        console.log(`${city} ${kind} ${host} NEW: ${await run(endpoint, q)}`);
        await pause();
      }
    }
  }
}
