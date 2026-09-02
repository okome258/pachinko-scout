/** OCRテキスト → 構造化データ（端末内・無料） */

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

export function parseOcrText(raw) {
  const text = raw.replace(/\s+/g, " ");
  const data = {
    machine_name: null,
    today_big_hits: null,
    today_first_hits: null,
    first_hit_probability: null,
    lt_success: null,
    lt_rate_percent: null,
    today_max_payout: null,
    current_spins: null,
    recent_hits_summary: null,
  };

  const nameM = text.match(/(?:P\s*)?([A-Za-z\u30a0-\u30ff\u4e00-\u9fff]{2,20})/);
  if (nameM) data.machine_name = nameM[1].slice(0, 20);

  const todayBig = firstMatch(text, [
    /本日[^\d]*(\d+)[^\d]*大当/,
    /大当[りり][^\d]*本日[^\d]*(\d+)/,
    /本日\s*(\d+)\s*$/m,
  ]);
  if (todayBig) data.today_big_hits = num(todayBig[1]);

  const todayFirst = firstMatch(text, [
    /初当[りり][^\d]*本日[^\d]*(\d+)/,
    /本日[^\d]*(\d+)[^\d]*初当/,
    /初当[^\d]*(\d+)/,
  ]);
  if (todayFirst) data.today_first_hits = num(todayFirst[1]);

  const prob = firstMatch(text, [/初当[りり]?確率[^\d]*1\s*\/\s*(\d+)/, /1\s*\/\s*(\d{2,4})/]);
  if (prob) data.first_hit_probability = `1/${prob[1]}`;

  const lt = firstMatch(text, [/LT[^\d]*(\d+)\s*\/\s*(\d+)/i, /(\d+)\s*\/\s*(\d+)\s*\(?\s*0\.0/]);
  if (lt) {
    data.lt_success = `${lt[1]}/${lt[2]}`;
    const t = num(lt[2]);
    if (t > 0) data.lt_rate_percent = (num(lt[1]) / t) * 100;
  }

  const maxPay = firstMatch(text, [/最高出玉[^\d]*(\d{2,6})/, /本日[^\d]*(\d{2,4})\s/]);
  if (maxPay) data.today_max_payout = num(maxPay[1]);

  const spins = firstMatch(text, [
    /スタート回数[^\d]*(\d+)/,
    /現在[^\d]*(\d+)\s*回転/,
    /\|\s*(\d{2,4})\s*$/,
    /\b(\d{2,3})\s*$/m,
  ]);
  if (spins) data.current_spins = num(spins[1]);

  if (/2R/i.test(text) && /1[0-9]{2}/.test(text)) {
    data.recent_hits_summary = "2R小出玉連続";
  }

  const filled = Object.values(data).filter((v) => v != null).length;
  return { data, confidence: filled >= 3 ? "ok" : filled >= 1 ? "low" : "none" };
}
