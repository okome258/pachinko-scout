/** 1回のスキャン = 機種情報と台データを別管理 */

import { pickDisplayName } from "./machine-picker-ui.js";

export function formatCounterSummary(data) {
  if (!data) return "データなし";
  const parts = [];
  if (data.current_spins != null) parts.push(`現在${data.current_spins}回`);
  if (data.today_first_hits != null) parts.push(`初当${data.today_first_hits}`);
  if (data.today_big_hits != null) parts.push(`大当${data.today_big_hits}`);
  if (data.lt_success) parts.push(`LT ${data.lt_success}`);
  else if (data.lt_rate_percent != null) parts.push(`LT ${Math.round(data.lt_rate_percent)}%`);
  if (data.today_max_payout != null) parts.push(`最高${data.today_max_payout}玉`);
  if (data.first_hit_probability) parts.push(`実績${data.first_hit_probability}`);
  return parts.length ? parts.join(" · ") : "読み取り項目なし";
}

export function formatMachineSummary(spec, ocrName, machineId) {
  if (!spec) return { title: "未設定", meta: "機種を選択してください" };
  const name = pickDisplayName(spec);
  const official = spec.names?.[0] && spec.names[0] !== name ? spec.names[0] : "";
  const denom = spec.first_hit_denom ? `1/${Math.round(spec.first_hit_denom)}` : "";
  const ceiling = spec.ceiling_spins ? `天井${spec.ceiling_spins}` : "";
  const src =
    machineId && machineId !== "auto" && machineId !== "ocr"
      ? "手動"
      : spec.match_source === "keyword"
        ? "キーワード一致"
        : spec.match_source === "name"
          ? "OCR一致"
          : spec.match_source === "manual"
            ? "手動"
            : "推定";
  let meta = [denom, ceiling, src].filter(Boolean).join(" · ");
  if (official) meta += ` · ${official}`;
  if (ocrName && ocrName !== name && ocrName !== official) meta += `（OCR: ${ocrName}）`;
  return { title: name, meta };
}

export function mergeCounterData(base, overrides) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(overrides || {})) {
    if (v === "" || v == null) delete out[k];
    else out[k] = v;
  }
  return out;
}

export function applyDataOverrides(base, form) {
  const o = {};
  const spins = form.current_spins?.trim();
  if (spins !== "" && spins != null) o.current_spins = parseInt(spins, 10);
  const first = form.today_first_hits?.trim();
  if (first !== "" && first != null) o.today_first_hits = parseInt(first, 10);
  const big = form.today_big_hits?.trim();
  if (big !== "" && big != null) o.today_big_hits = parseInt(big, 10);
  const lt = form.lt_success?.trim();
  if (lt) {
    const m = lt.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) {
      o.lt_success = `${m[1]}/${m[2]}`;
      const t = parseInt(m[2], 10);
      if (t > 0) o.lt_rate_percent = (parseInt(m[1], 10) / t) * 100;
    }
  }
  const maxp = form.today_max_payout?.trim();
  if (maxp !== "" && maxp != null) o.today_max_payout = parseInt(maxp, 10);
  const prob = form.first_hit_probability?.trim();
  if (prob) o.first_hit_probability = prob.includes("/") ? prob : `1/${prob}`;
  return mergeCounterData(base, o);
}

export function suggestMachineIdFromOcr(data, db, matchMachineFn) {
  const matched = matchMachineFn(data.machine_name, db, data);
  if (matched?.id && !String(matched.id).startsWith("profile_") && matched.id !== "p_generic_mid") {
    return matched.id;
  }
  return "auto";
}
