/** 遊タイム / 深度目安の表示ヘルパ */

export function hasYutime(spec = {}) {
  if (spec.has_yutime === true || spec.yutime_spins) return true;
  if (spec.has_yutime === false) return false;
  const blob = [
    spec.picker_label,
    spec.display_name,
    ...(spec.names || []),
    spec.notes,
    spec.ev_spec?.machine_mode,
  ]
    .filter(Boolean)
    .join(" ");
  return /遊タイム/.test(blob);
}

/** 判定に使う深度ライン（遊タイム発動回転 or 目安） */
export function getDepthLine(spec = {}) {
  const denom =
    Number(spec.first_hit_denom) ||
    Number(spec.ev_spec?.first_hit_denom) ||
    null;
  const yutime = Number(spec.yutime_spins);
  if (hasYutime(spec) && yutime > 0) {
    return {
      spins: yutime,
      kind: "yutime",
      label: "遊タイム",
      short: `遊タイム${yutime}`,
    };
  }
  const fallback =
    Number(spec.ceiling_spins) ||
    (denom ? Math.round(denom * 2.75) : 1000);
  if (hasYutime(spec)) {
    return {
      spins: fallback,
      kind: "yutime",
      label: "遊タイム",
      short: `遊タイム約${fallback}`,
    };
  }
  return {
    spins: fallback,
    kind: "depth",
    label: "深度目安",
    short: `深度目安${fallback}`,
  };
}
