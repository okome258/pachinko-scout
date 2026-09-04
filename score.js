/** ブラウザ内スコアリング（機種別対応） */

import { getDepthLine } from "./depth.js";

function parseFraction(value) {
  if (!value) return null;
  const m = String(value).match(/1\s*\/\s*(\d+)/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  return d > 0 ? d : null;
}

function parseLtRate(ltSuccess, ltRatePercent) {
  if (ltRatePercent != null && !Number.isNaN(Number(ltRatePercent))) {
    return Number(ltRatePercent);
  }
  if (!ltSuccess) return null;
  const m = String(ltSuccess).match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  const success = parseInt(m[1], 10);
  const total = parseInt(m[2], 10);
  if (total <= 0) return null;
  return (success / total) * 100;
}

function applyBaseScore(data) {
  let score = 50;
  const reasons = [];

  const ltRate = parseLtRate(data.lt_success, data.lt_rate_percent);
  const todayMax = data.today_max_payout;
  const currentSpins = data.current_spins;
  const firstProb = parseFraction(data.first_hit_probability);
  const todayFirst = data.today_first_hits || 0;
  const recent = String(data.recent_hits_summary || "");

  if (ltRate != null) {
    if (ltRate >= 50) {
      score += 18;
      reasons.push(`LT率 ${Math.round(ltRate)}%`);
    } else if (ltRate === 0 && todayFirst >= 2) {
      score -= 22;
      reasons.push(`LT 0/${todayFirst}`);
    } else if (ltRate < 30 && todayFirst >= 1) {
      score -= 10;
      reasons.push(`LT率 ${Math.round(ltRate)}%`);
    }
  }

  if (todayMax != null) {
    const payout = Number(todayMax);
    if (!Number.isNaN(payout)) {
      if (payout >= 3000) {
        score += 12;
        reasons.push(`最高出玉 ${Math.round(payout).toLocaleString()}`);
      } else if (payout <= 300 && todayFirst >= 2) {
        score -= 18;
        reasons.push(`最高出玉 ${Math.round(payout)} 小出玉`);
      }
    }
  }

  if (firstProb != null) {
    if (firstProb <= 99) {
      score += 8;
      reasons.push(`初当り 1/${firstProb}`);
    } else if (firstProb >= 250) {
      score -= 8;
      reasons.push(`初当り 1/${firstProb} 重い`);
    }
  }

  if (currentSpins != null) {
    const spins = parseInt(currentSpins, 10);
    if (!Number.isNaN(spins)) {
      if (spins >= 400) {
        score += 10;
        reasons.push(`現在 ${spins} 回転`);
      } else if (spins <= 80 && todayFirst >= 2) {
        score -= 5;
        reasons.push(`直後 ${spins} 回転`);
      }
    }
  }

  if ((/2R\s*1[0-9]{2}/.test(recent) || recent.includes("小")) && todayFirst >= 2) {
    score -= 8;
    reasons.push("2R小出玉連続");
  }

  if (data.game_type === "pachislo") {
    const games = parseInt(currentSpins, 10);
    if (!Number.isNaN(games) && games >= 400) {
      score += 10;
      reasons.push(`ゲーム数 ${games}`);
    }
    if ((data.bb_count || 0) === 0 && (data.rb_count || 0) === 0 && games >= 200) {
      score -= 8;
      reasons.push("本日BB/RBなし");
    }
  }

  return { score, reasons };
}

function applyMachineRules(data, spec) {
  let scoreDelta = 0;
  const reasons = [];
  if (!spec) return { scoreDelta, reasons };

  const ltRate = parseLtRate(data.lt_success, data.lt_rate_percent);
  const todayFirst = data.today_first_hits || 0;
  const todayMax = Number(data.today_max_payout);
  const spins = parseInt(data.current_spins, 10);
  const smallMax = spec.small_hit_max ?? 300;
  const goodMin = spec.good_hit_min ?? 3000;

  if (spec.lt_critical && ltRate === 0 && todayFirst >= 2) {
    scoreDelta -= 12;
    reasons.push(`${spec.names[0]}: LT未入りが致命的`);
  }

  if (!Number.isNaN(todayMax) && todayMax <= smallMax && todayFirst >= 2) {
    scoreDelta -= 10;
    reasons.push(`${spec.names[0]}: 小出玉連発`);
  }

  if (!Number.isNaN(todayMax) && todayMax >= goodMin) {
    scoreDelta += 8;
    reasons.push(`${spec.names[0]}: まだ伸びあり`);
  }

  const depth = getDepthLine(spec);
  if (depth.spins && !Number.isNaN(spins)) {
    const ratio = spins / depth.spins;
    const near = spec.ceiling_near_ratio ?? 0.75;
    if (ratio >= near) {
      scoreDelta += depth.kind === "yutime" ? 18 : 15;
      reasons.push(`${depth.label}まであと${depth.spins - spins}回転`);
    } else if (ratio < 0.15 && todayFirst >= 2) {
      scoreDelta -= 6;
      reasons.push(`${depth.label}まで余裕（${spins}/${depth.spins}）`);
    }
  }

  if (spec.type === "light_mid" && spins >= 300) {
    scoreDelta += 6;
    reasons.push("甘めタイプ・回転稼働中");
  }

  return { scoreDelta, reasons, machineLabel: spec.names[0] };
}

export function scoreMachine(data, machineSpec = null, { border } = {}) {
  const rate = Number(data.spins_per_1000);
  const target = Number(border);
  if (!(rate > 0) || !(target > 0)) {
    return {
      score: null,
      verdict: "実測待ち",
      reasons: ["試し打ち回転と投資額を入れると、ボーダーとの差で判定します"],
      machine_matched: machineSpec?.names?.[0] || null,
    };
  }
  const difference = rate - target;
  let measuredScore = Math.round(50 + difference * 14);
  const measuredReasons = [
    `実測 ${rate.toFixed(1)}回/千円（ボーダー${difference >= 0 ? "+" : ""}${difference.toFixed(1)}）`,
  ];
  const depth = getDepthLine(machineSpec || {});
  const spins = Number(data.current_spins);
  if (
    depth.kind === "yutime" &&
    Number(machineSpec?.yutime_spins) > 0 &&
    Number.isFinite(spins) &&
    Math.max(0, depth.spins - spins) <= 150
  ) {
    measuredScore += 10;
    measuredReasons.push(`遊タイムまであと${Math.max(0, depth.spins - spins)}回`);
  }
  measuredScore = Math.max(0, Math.min(100, measuredScore));
  return {
    score: measuredScore,
    verdict: measuredScore >= 65 ? "打つ候補" : measuredScore < 45 ? "見送り" : "様子見",
    reasons: measuredReasons,
    machine_matched: machineSpec?.names?.[0] || null,
  };
}

export function verdictColor(verdict) {
  if (verdict === "実測待ち") return "#94a3b8";
  if (verdict === "打つ候補") return "#22c55e";
  if (verdict === "見送り") return "#ef4444";
  return "#eab308";
}
