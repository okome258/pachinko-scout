/** OCRテキスト → 構造化データ（全スカウター種別対応） */

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m;
  }
  return null;
}

function num(s) {
  if (s == null) return null;
  const n = parseInt(String(s).replace(/,/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

function parseTimelineSpins(text) {
  const current = firstMatch(text, [
    /現在[^\d]*(\d{1,4})/,
    /現在スタート[^\d]*(\d+)/,
    /ゲーム[^\d]*(\d{1,4})\s*回/,
  ]);
  if (current) return num(current[1]);

  const timelineNums = text.match(/\b(\d{1,4})\b/g);
  if (!timelineNums || timelineNums.length < 2) return null;
  const candidates = timelineNums
    .map((x) => parseInt(x, 10))
    .filter((n) => n >= 0 && n <= 2000);
  if (!candidates.length) return null;
  const small = candidates.filter((n) => n >= 5 && n <= 999);
  return small.length ? small[small.length - 1] : candidates[candidates.length - 1];
}

function parseRecentHits(text) {
  if ((text.match(/2\s*R/gi) || []).length >= 2 && /1[0-9]{2}/.test(text)) {
    return "2R小出玉連続";
  }
  const streak = text.match(/(\d{1,2})\s*連/);
  if (streak) return `${streak[1]}連履歴あり`;
  const rHist = text.match(/(\d{1,2})R/gi);
  if (rHist && rHist.length >= 2) return `${rHist[0]}等の履歴`;
  return null;
}

function parseMachineName(text) {
  const patterns = [
    /e\s*バイオハザード\s*6/i,
    /P\s*バイオハザード\s*RE\s*:?\s*2/i,
    /P\s*バイオ[^\s]*/i,
    /(バイオハザード\s*6|バイオハザード\s*RE\s*:?\s*2)/i,
    /CR\s*パチンコ[^\s]*/i,
    /P\s*([A-Z][A-Za-z\s]+)/,
    /P\s*バイオハザード\s*RE\s*:?\s*2/i,
    /バイオハザード\s*RE\s*:?\s*2/i,
    /(バイオハザード\s*6|バイオハザード\s*RE|BIOHAZARD|HAZARD)/i,
    /(ワンエー物語|ワンエー)/i,
    /(VERSUS|ヴァーサス)/i,
    /(エヴァ|EVA|ヱヴァ)/i,
    /(ゴジラ|GODZILLA)/i,
    /(ファフナー|FAFNER)/i,
    /([\u4e00-\u9fffァ-ヴー]{4,14}物語)/,
    /([A-Z]{4,12})/,
    /([\u4e00-\u9fff]{3,10})/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const name = (m[1] || m[0]).trim();
      if (!/本日|大当|スタート|確変|初当|日前/.test(name)) return name;
    }
  }
  return null;
}

/**
 * 採点に必要なカウンター情報が揃ったかを判定する。
 * game_type や機種名のような補助項目は、読取成功の根拠にしない。
 */
export function assessCounterReadability(data) {
  const hasSpins =
    data?.current_spins != null &&
    data.current_spins !== "" &&
    Number.isFinite(Number(data.current_spins));
  const facts = [
    data?.today_big_hits,
    data?.today_first_hits,
    data?.lt_success,
    data?.today_max_payout,
    data?.first_hit_probability,
  ].filter((value) => value != null).length;

  const missing = [];
  if (!hasSpins) missing.push("現在スタート");
  if (facts < 1) missing.push("初当り・大当り・LT・最高出玉のいずれか");

  return {
    ready: missing.length === 0,
    missing,
    facts,
  };
}

export function parseOcrText(raw) {
  const text = raw.replace(/\s+/g, " ");
  const data = {
    machine_name: null,
    game_type: "pachinko",
    today_big_hits: null,
    today_first_hits: null,
    first_hit_probability: null,
    spec_on_screen: null,
    lt_success: null,
    lt_rate_percent: null,
    today_max_payout: null,
    current_spins: null,
    total_spins: null,
    bb_count: null,
    rb_count: null,
    recent_hits_summary: null,
    kakuhen_count: null,
    avg_probability: null,
  };

  data.machine_name = parseMachineName(text);

  if (/BB|RB|ボーナス合計|ゲーム\s*\d+回/.test(text)) {
    data.game_type = "pachislo";
  }

  const spec = firstMatch(text, [
    /スペック[^\d]*1\s*\/\s*(\d+(?:\.\d+)?)/,
    /1\s*\/\s*(\d+(?:\.\d+)?)/,
  ]);
  if (spec) {
    data.spec_on_screen = `1/${spec[1]}`;
    data.first_hit_probability = data.spec_on_screen;
  }

  const todayBig = firstMatch(text, [
    /本日[^\d]*(\d+)[^\d]*大当/,
    /大当[りりた][^\d]*本日[^\d]*(\d+)/,
    /大当[りりた][^\d]*(\d+)[^\d]*本日/,
    /ボーナス合計[^\d]*(\d+)/,
  ]);
  if (todayBig) data.today_big_hits = num(todayBig[1]);

  const todayFirst = firstMatch(text, [
    /初当[りり]?[^\d]*本日[^\d]*(\d+)/,
    /本日[^\d]*(\d+)[^\d]*初当/,
    /初当[りり]?[^\d]*(\d+)/,
  ]);
  if (todayFirst) data.today_first_hits = num(todayFirst[1]);

  const prob = firstMatch(text, [
    /初当[りり]?確率[^\d]*1\s*\/\s*(\d+)/,
    /大当[りり]確率[^\d]*1\s*\/\s*(\d+)/,
    /平均[^\d]*1\s*\/\s*(\d+(?:\.\d+)?)/,
  ]);
  if (prob && !data.first_hit_probability) {
    data.first_hit_probability = `1/${prob[1]}`;
  }

  const lt = firstMatch(text, [
    /LT[^\d]*(\d+)\s*\/\s*(\d+)/i,
    /(\d+)\s*\/\s*(\d+)\s*\(?\s*0\.0/,
  ]);
  if (lt) {
    data.lt_success = `${lt[1]}/${lt[2]}`;
    const t = num(lt[2]);
    if (t > 0) data.lt_rate_percent = (num(lt[1]) / t) * 100;
  }

  const maxPay = firstMatch(text, [
    /最高出玉[^\d]*(\d{2,6})/,
    /最高持玉[^\d]*(\d{2,6})/,
    /過去最高[^\d]*(\d{2,6})/,
    /最高玉数[^\d]*(\d{2,6})/,
    /最高枚数[^\d]*(\d{2,6})/,
    /(\d{4,6})\s*玉/,
    /(\d{3,5})\s*枚/,
  ]);
  if (maxPay) data.today_max_payout = num(maxPay[1]);

  const spinsDirect = firstMatch(text, [
    /現在スタート[^\d]*(\d+)/,
    /スタート回数[^\d]*(\d+)/,
    /スタート[^\d]*(\d{1,4})/,
    /現在[^\d]*(\d{1,4})\s*回転/,
    /ゲーム[^\d]*(\d{1,4})\s*回/,
  ]);
  data.current_spins = spinsDirect ? num(spinsDirect[1]) : parseTimelineSpins(text);

  const total = firstMatch(text, [/総スタート[^\d]*(\d+)/, /累計[^\d]*(\d{2,5})\s*回/]);
  if (total) data.total_spins = num(total[1]);

  const bb = firstMatch(text, [/BB[^\d]*(\d+)/i]);
  if (bb) data.bb_count = num(bb[1]);
  const rb = firstMatch(text, [/RB[^\d]*(\d+)/i]);
  if (rb) data.rb_count = num(rb[1]);

  const kakuhen = firstMatch(text, [/確変[^\d]*(\d+)/, /初当[^\d]*(\d+)/]);
  if (kakuhen) data.kakuhen_count = num(kakuhen[1]);

  const avg = firstMatch(text, [/平均[^\d]*(\d+(?:\.\d+)?)/, /1\s*\/\s*(\d+(?:\.\d+)?)/]);
  if (avg && !data.first_hit_probability) {
    data.avg_probability = `1/${avg[1]}`;
    data.first_hit_probability = data.avg_probability;
  }

  data.recent_hits_summary = parseRecentHits(text);

  const readability = assessCounterReadability(data);
  const keys = Object.keys(data).filter((k) => data[k] != null);
  const confidence = readability.ready
    ? keys.length >= 5 ? "ok" : "low"
    : "none";

  return { data, confidence, readability, raw_length: text.length };
}
