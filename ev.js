/** 機種スペック + ev_spec（DMM詳細）に基づく期待値 */

function parseDenom(prob) {
  if (!prob) return null;
  const m = String(prob).match(/1\s*\/\s*(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function parseLtRate(data) {
  if (data.lt_rate_percent != null) return Number(data.lt_rate_percent);
  if (!data.lt_success) return null;
  const m = String(data.lt_success).match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  const t = parseInt(m[2], 10);
  return t > 0 ? (parseInt(m[1], 10) / t) * 100 : null;
}

function pct(rate) {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

/**
 * 機種 ev_spec から理論ベースライン（-50〜+50）を算出
 */
function calcTheoreticalBaseline(evSpec = {}) {
  if (!evSpec || evSpec.spec_level !== "detail") return { baseline: 0, factors: [] };

  const factors = [];
  const denom = evSpec.first_hit_denom;
  const entry =
    evSpec.entry_rate_primary ??
    evSpec.lt_entry_rate_total ??
    evSpec.lt_entry_rate ??
    evSpec.rush_entry_rate ??
    evSpec.kakuhen_entry_rate;
  const cont = evSpec.continuation_rate ?? evSpec.lt_continuation_rate ?? evSpec.rush_continuation_rate;
  const avgBig = evSpec.avg_big_payout ?? (evSpec.payouts?.length ? evSpec.payouts[evSpec.payouts.length - 1] : null);

  if (evSpec.theoretical_index != null) {
    const baseline = Math.max(-50, Math.min(50, Math.round((evSpec.theoretical_index - 15) * 2)));
    if (entry != null) factors.push(`突入${pct(entry)}（${evSpec.machine_mode || "—"}）`);
    if (cont != null) factors.push(`継続${pct(cont)}`);
    if (avgBig) factors.push(`大出玉目安${avgBig.toLocaleString()}玉`);
    return { baseline, factors, hasDetail: true };
  }

  if (!denom || !entry) {
    return { baseline: 0, factors: ["詳細スペック不足"], hasDetail: false };
  }

  const payoutEst = avgBig || 1500;
  const index = (entry * payoutEst) / denom;
  const baseline = Math.max(-50, Math.min(50, Math.round((index - 15) * 2)));
  factors.push(`突入${pct(entry)} / 1/${Math.round(denom)}`);
  if (cont != null) factors.push(`継続${pct(cont)}`);
  if (avgBig) factors.push(`大出玉目安${avgBig.toLocaleString()}玉`);
  return { baseline, factors, hasDetail: true };
}

/**
 * 機種個別スペック + 台カウンター → 期待値指数（-100〜+100）
 */
export function calcExpectedValue(data, spec = {}) {
  const spins = parseInt(data.current_spins, 10) || 0;
  const evSpec = spec.ev_spec || {};
  const denom =
    evSpec.first_hit_denom ||
    spec.first_hit_denom ||
    parseDenom(data.spec_on_screen || data.first_hit_probability) ||
    319;
  const ceiling = spec.ceiling_spins || Math.round(denom * 2.8);
  const ltCritical =
    spec.lt_critical ??
    !!(evSpec.lt_entry_rate || evSpec.lt_entry_rate_total || evSpec.lt_continuation_rate);
  const smallMax = spec.small_hit_max ?? evSpec.small_hit_payout ?? 300;
  const goodMin = spec.good_hit_min ?? (evSpec.avg_big_payout || 3000);
  const costPerSpin = spec.cost_per_spin ?? 4;

  const todayFirst = data.today_first_hits || 0;
  const todayMax = Number(data.today_max_payout) || 0;
  const ltRate = parseLtRate(data);
  const avgFirst = Math.round(denom);

  const { baseline, factors: specFactors, hasDetail } = calcTheoreticalBaseline(evSpec);
  let ev = baseline;
  const factors = [...specFactors];

  const spinsToAvg = avgFirst - spins;
  if (spinsToAvg > 0) {
    const waitCost = spinsToAvg * costPerSpin * 0.15;
    ev -= Math.min(25, waitCost / 100);
    factors.push(`平均初当りまで約${spinsToAvg}回`);
  } else {
    const over = spins - avgFirst;
    ev += Math.min(20, over * 0.08);
    factors.push(`平均超え+${over}回 — 初当り圏内`);
  }

  const toCeiling = ceiling - spins;
  if (toCeiling > 0 && toCeiling <= 150) {
    ev += 22;
    factors.push(`天井${ceiling}まであと${toCeiling}回`);
  } else if (toCeiling > 150 && toCeiling < 400) {
    ev += 8;
    factors.push(`天井まで${toCeiling}回`);
  } else if (spins < avgFirst * 0.25 && todayFirst >= 2) {
    ev -= 12;
    factors.push(`初当り直後${spins}回 — まだ早い`);
  }

  if (ltCritical) {
    if (ltRate != null && ltRate >= 50) {
      ev += 18;
      factors.push(`LT率${Math.round(ltRate)}% — 良好`);
    } else if (ltRate === 0 && todayFirst >= 2) {
      ev -= 28;
      factors.push(`LT 0/${todayFirst} — 要警戒`);
    } else if (ltRate != null && ltRate < 30) {
      ev -= 12;
      factors.push(`LT率${Math.round(ltRate)}% — 低い`);
    } else if (todayFirst === 0) {
      ev += 5;
      factors.push(`LT未確定`);
    }
  }

  if (todayMax >= goodMin) {
    ev += 15;
    factors.push(`最高${todayMax.toLocaleString()}玉 — 伸びあり`);
  } else if (todayMax > 0 && todayMax <= smallMax && todayFirst >= 2) {
    ev -= 20;
    factors.push(`最高${todayMax}玉 — 小出玉続き`);
  }

  const actualDenom = parseDenom(data.first_hit_probability);
  if (actualDenom && actualDenom < denom * 0.85) {
    ev += 10;
    factors.push(`実績1/${Math.round(actualDenom)} — 回ってる`);
  } else if (actualDenom && actualDenom > denom * 1.4) {
    ev -= 10;
    factors.push(`実績1/${Math.round(actualDenom)} — 重い`);
  }

  ev = Math.max(-100, Math.min(100, Math.round(ev)));

  const specLevel = evSpec.spec_level || "generic";
  let label = "中立";
  if (ev >= 25) label = "期待値プラス寄り";
  else if (ev >= 10) label = "ややプラス";
  else if (ev <= -25) label = "期待値マイナス強";
  else if (ev <= -10) label = "ややマイナス";

  const modeLabel =
    specLevel === "detail"
      ? "機種+台"
      : specLevel === "listing"
        ? "台況のみ（突入率未取得）"
        : "台況のみ（汎用）";

  return {
    ev,
    label,
    factors: factors.slice(0, 5),
    spec_used: {
      name: spec.names?.[0] || "汎用",
      denom: Math.round(denom),
      ceiling,
      lt_critical: ltCritical,
      spec_level: specLevel,
      machine_mode: evSpec.machine_mode,
      entry_rate: evSpec.entry_rate_primary,
      has_detail: hasDetail,
    },
    summary: `期待値 ${ev >= 0 ? "+" : ""}${ev}（${label}）`,
    mode_label: modeLabel,
    retreat_hint:
      spinsToAvg > 0
        ? `初当り狙いならあと${Math.min(spinsToAvg + 80, ceiling - spins)}回まで`
        : `初当り圏内 — ${ceiling - spins}回で天井`,
  };
}
