/** 撤退回転数・打ち止めラインの計算 */

function parseDenom(prob) {
  if (!prob) return null;
  const m = String(prob).match(/1\s*\/\s*(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

export function calcRetreatPlan(data, spec = {}) {
  const spins = parseInt(data.current_spins, 10);
  const denom = parseDenom(data.spec_on_screen || data.first_hit_probability);
  const ceiling = spec.ceiling_spins || (denom ? Math.round(denom * 2.8) : 1000);
  const todayFirst = data.today_first_hits || 0;
  const ltRate = data.lt_rate_percent;
  const todayMax = Number(data.today_max_payout) || 0;

  const lines = [];
  let hardStop = null;
  let softStop = null;

  if (!Number.isNaN(spins) && denom) {
    const avgFirst = Math.round(denom);
    const patience = Math.round(denom * 1.2);
    softStop = spins + Math.max(80, patience - spins);
    hardStop = spins + Math.max(150, Math.round(denom * 1.8) - spins);

    lines.push(`理論平均初当り: 約${avgFirst}回転（1/${Math.round(denom)}）`);

    if (spins < avgFirst * 0.3 && todayFirst >= 2 && ltRate === 0) {
      lines.push(`⚠ 質の悪い初当り直後 — 無理に追わず見送り推奨`);
      hardStop = spins + 50;
    } else if (spins >= avgFirst) {
      lines.push(`平均超え ${spins - avgFirst}回 — そろそろ初当り圏内`);
    } else {
      lines.push(`平均まであと約${avgFirst - spins}回転`);
    }
  }

  if (!Number.isNaN(spins) && ceiling) {
    const toCeiling = ceiling - spins;
    if (toCeiling > 0 && toCeiling <= 200) {
      lines.push(`天井まで ${toCeiling}回転 — 期待値上がりやすい帯`);
      hardStop = hardStop ? Math.min(hardStop, spins + toCeiling + 30) : spins + toCeiling + 30;
    } else if (toCeiling > 200) {
      lines.push(`天井まで ${toCeiling}回転`);
    }
  }

  if (data.game_type === "pachislo" && !Number.isNaN(spins)) {
    const gamePatience = 400;
    softStop = spins + Math.max(100, gamePatience - (spins % gamePatience));
    hardStop = spins + 250;
    lines.push(`パチスロ: ゲーム${spins} — あと${hardStop - spins}Gで撤退検討`);
  }

  if (todayMax > 0 && todayMax <= (spec.small_hit_max || 300) && todayFirst >= 2) {
    hardStop = Math.min(hardStop ?? spins + 80, (spins || 0) + 80);
    lines.push(`小出玉連発 — ${hardStop}回転超えたら即撤退`);
  }

  const investCap = !Number.isNaN(spins) ? Math.max(5000, spins * 25) : 5000;
  lines.push(`投資上限目安: ${investCap.toLocaleString()}円`);

  return {
    soft_stop_spins: softStop,
    hard_stop_spins: hardStop,
    lines,
    summary:
      hardStop != null
        ? `🛑 ${hardStop}回転で撤退`
        : softStop != null
          ? `⚠ ${softStop}回転で様子見`
          : "上限を決めてから打つ",
  };
}
