/** 機種DBの読み込み・マッチング・スペック推定 */

const CACHE_KEY = "pachinko_machines_cache";

export async function loadMachines(baseUrl = "") {
  const url = `${baseUrl.replace(/\/$/, "")}/machines.json`;
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error("fetch failed");
    const db = await res.json();
    localStorage.setItem(CACHE_KEY, JSON.stringify(db));
    return db;
  } catch {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached);
    return { version: "offline", machines: [], type_profiles: {}, counter_types: [] };
  }
}

export function matchMachine(ocrName, db, parsedData = {}) {
  if (ocrName && db?.machines?.length) {
    const upper = ocrName.toUpperCase();
    for (const m of db.machines) {
      for (const name of m.names) {
        if (upper.includes(name.toUpperCase()) || ocrName.includes(name)) {
          return { ...m, match_source: "name" };
        }
      }
    }
  }

  const profile = inferTypeProfile(parsedData, db);
  if (profile) {
    return {
      id: `profile_${profile.key}`,
      names: [profile.label],
      type: profile.key,
      ...profile.spec,
      match_source: parsedData.spec_on_screen ? "spec_on_screen" : "spec_inferred",
      notes: profile.spec.notes,
    };
  }

  return {
    id: "p_generic_mid",
    names: ["汎用"],
    type: "mid",
    lt_critical: true,
    ceiling_spins: 1000,
    small_hit_max: 300,
    good_hit_min: 3000,
    ceiling_near_ratio: 0.75,
    match_source: "fallback",
    notes: "機種・スペック不明時の汎用ミドル",
  };
}

function parseDenom(prob) {
  if (!prob) return null;
  const m = String(prob).match(/1\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return parseFloat(m[1]);
}

export function inferTypeProfile(data, db) {
  const profiles = db?.type_profiles || {};
  const denom = parseDenom(data.first_hit_probability || data.spec_on_screen);
  if (denom == null) return null;

  const order = ["amadeji", "light_mid", "mid", "heavy"];
  for (const key of order) {
    const p = profiles[key];
    if (!p?.spec_range) continue;
    const [lo, hi] = p.spec_range;
    if (denom >= lo && denom <= hi) {
      return {
        key,
        label: p.notes || key,
        spec: {
          lt_critical: p.lt_critical ?? true,
          ceiling_spins: p.ceiling_spins,
          small_hit_max: p.small_hit_max,
          good_hit_min: p.good_hit_min,
          ceiling_near_ratio: 0.75,
          notes: p.notes,
        },
      };
    }
  }
  return null;
}

export function detectCounterType(ocrText, db) {
  const text = ocrText || "";
  let best = null;
  let bestScore = 0;
  for (const ct of db.counter_types || []) {
    if (ct.id === "unknown") continue;
    const score = (ct.keywords || []).filter((kw) => text.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      best = ct;
    }
  }
  return best || (db.counter_types || []).find((c) => c.id === "unknown");
}
