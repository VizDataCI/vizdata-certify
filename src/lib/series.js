/* Agrégation mensuelle pour les histogrammes. */

import { MONTHS_SHORT, TODAY } from "./dates.js";

function monthlySeries(items, dateKey, months = 8) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const v = items.filter((x) => {
      const dd = new Date(x[dateKey]);
      return `${dd.getFullYear()}-${dd.getMonth()}` === key;
    }).length;
    out.push({ k: MONTHS_SHORT[d.getMonth()], v });
  }
  return out;
}

export { monthlySeries };
