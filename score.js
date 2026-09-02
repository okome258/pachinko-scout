/** ブラウザ内スコアリング（API不要・無料） */

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

export function scoreMachine(data) {
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
      score += 20;
      reasons.push(`LT率 ${Math.round(ltRate)}% と良好`);
    } else if (ltRate === 0 && todayFirst >= 2) {
      score -= 25;
      reasons.push(`本日LT 0/${todayFirst} — 質の悪い初当り`);
    } else if (ltRate < 30 && todayFirst >= 1) {
      score -= 10;
      reasons.push(`LT率 ${Math.round(ltRate)}% と低い`);
    }
  }

  if (todayMax != null) {
    const payout = Number(todayMax);
    if (!Number.isNaN(payout)) {
      if (payout >= 3000) {
        score += 15;
        reasons.push(`本日最高出玉 ${Math.round(payout).toLocaleString()}`);
      } else if (payout <= 300 && todayFirst >= 2) {
        score -= 20;
        reasons.push(`本日最高出玉 ${Math.round(payout)} — 小出玉`);
      }
    }
  }

  if (firstProb != null) {
    if (firstProb <= 99) {
      score += 8;
      reasons.push(`初当り 1/${firstProb} と甘め`);
    } else if (firstProb >= 250) {
      score -= 8;
      reasons.push(`初当り 1/${firstProb} と重い`);
    }
  }

  if (currentSpins != null) {
    const spins = parseInt(currentSpins, 10);
    if (!Number.isNaN(spins)) {
      if (spins >= 400) {
        score += 12;
        reasons.push(`現在 ${spins} 回転`);
      } else if (spins <= 80 && todayFirst >= 2) {
        score -= 5;
        reasons.push(`直後 ${spins} 回転`);
      }
    }
  }

  if ((/2R\s*1[0-9]{2}/.test(recent) || recent.includes("小")) && todayFirst >= 2) {
    score -= 8;
    reasons.push("直近2R小出玉寄り");
  }

  let verdict = "様子見";
  if (score >= 65) verdict = "打つ候補";
  else if (score < 45) verdict = "見送り";

  return { score, verdict, reasons: reasons.length ? reasons : ["他台と比較"] };
}

export function verdictColor(verdict) {
  if (verdict === "打つ候補") return "#22c55e";
  if (verdict === "見送り") return "#ef4444";
  return "#eab308";
}
