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

const KEYWORD_MACHINE_IDS = [
  { re: /バイオハザード\s*6|e\s*バイオ|BIOHAZARD|HAZARD/i, ids: ["p_e_バイオハザード6", "p_biohazard"] },
];

function matchByKeyword(blob, db) {
  if (!blob || !db?.machines?.length) return null;
  for (const rule of KEYWORD_MACHINE_IDS) {
    if (!rule.re.test(blob)) continue;
    for (const id of rule.ids) {
      const m = db.machines.find((x) => x.id === id);
      if (m) return { ...m, match_source: "keyword" };
    }
  }
  return null;
}

export function matchMachine(ocrName, db, parsedData = {}) {
  const blob = `${ocrName || ""} ${parsedData.ocr_raw || ""}`;

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

  const byKeyword = matchByKeyword(blob, db);
  if (byKeyword) return byKeyword;

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

/** カメラスキャン時の機種名フィードバック */
export function getMachineNameFeedback(ocrName, db, machineSpec, selectedId) {
  if (selectedId && selectedId !== "auto") {
    return {
      display: machineSpec?.names?.[0] || "手動選択",
      ocr: ocrName || null,
      status: "manual",
      statusLabel: "手動選択（個別スペック適用）",
      inDb: true,
    };
  }

  if (!ocrName || !String(ocrName).trim()) {
    const fallback = machineSpec?.match_source === "spec_on_screen" || machineSpec?.match_source === "spec_inferred";
    return {
      display: "機種名なし",
      ocr: null,
      status: fallback ? "no_name_spec_only" : "no_name",
      statusLabel: fallback
        ? "機種名なし — 画面の1/○○からタイプ推定"
        : "機種名なし — 汎用ルール",
      inDb: false,
    };
  }

  const upper = ocrName.toUpperCase();
  for (const m of db?.machines || []) {
    for (const name of m.names || []) {
      if (upper.includes(name.toUpperCase()) || ocrName.includes(name)) {
        return {
          display: ocrName,
          ocr: ocrName,
          status: "db_hit",
          statusLabel: `DB一致: ${m.names[0]}（個別スペックで期待値）`,
          inDb: true,
          dbName: m.names[0],
        };
      }
    }
  }

  if (machineSpec?.match_source === "keyword" && machineSpec?.names?.[0]) {
    return {
      display: machineSpec.names[0],
      ocr: ocrName || null,
      status: "db_hit",
      statusLabel: `キーワード一致: ${machineSpec.names[0]}`,
      inDb: true,
      dbName: machineSpec.names[0],
    };
  }

  return {
    display: ocrName,
    ocr: ocrName,
    status: "ocr_only",
    statusLabel: "OCRのみ — DB未登録・タイプ推定で期待値",
    inDb: false,
  };
}
