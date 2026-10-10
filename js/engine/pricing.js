// Cart totals: value at PTR, free cases and scheme discounts. Pure: no DOM, no storage, no clock.
// Never throws on imperfect input; an empty cart gives zero totals.

import { cartLines, productIndex } from './schemes.js';

function roundHalfUp(n) {
  return Math.floor(n + 0.5);
}

// Splits one percentage scheme's discount over the lines it discounts, in proportion to value.
// The shares add up exactly to the scheme's discountValue: the rounding remainder goes on
// the largest discounted line. A share never goes below 0: what the largest line cannot give
// back comes off the next largest.
function spreadDiscount(scheme, bySkuLine) {
  const total = Number(scheme.discountValue);
  if (!Number.isFinite(total) || total <= 0 || !Array.isArray(scheme.skus)) return;

  // Pooled: every scheme line. Not pooled: only the lines that reach the threshold themselves.
  const threshold = Number(scheme.threshold);
  const lines = [];
  for (const sku of scheme.skus) {
    const line = bySkuLine[sku];
    if (!line || line.value <= 0 || lines.includes(line)) continue;
    if (scheme.pooled === true || !Number.isFinite(threshold) || line.cases >= threshold) lines.push(line);
  }
  let value = 0;
  for (const line of lines) value += line.value;
  if (value <= 0) return;

  const shares = lines.map((line) => roundHalfUp(total * line.value / value));
  let left = total;
  for (const share of shares) left -= share;
  const bySize = lines.map((line, i) => i).sort((a, b) => lines[b].value - lines[a].value || a - b);
  for (const i of bySize) {
    const moved = Math.max(-shares[i], left);
    shares[i] += moved;
    left -= moved;
  }
  lines.forEach((line, i) => { line.discount += shares[i]; });
}

// cart: the store's cart object or the lines map. products: the array (lines come out in
// product-master order) or a map keyed by sku (cart order). schemeResults: the output of
// evaluateSchemes(); when missing there are no free cases and no discounts.
export function priceCart(cart, products, schemeResults) {
  const cartMap = cartLines(cart);
  const bySku = productIndex(products);

  // Product-master order first; a cart sku that is not in the master goes last, in cart order.
  const order = [];
  if (Array.isArray(products)) {
    for (const product of products) {
      if (product && cartMap[product.sku] && !order.includes(product.sku)) order.push(product.sku);
    }
  }
  for (const sku of Object.keys(cartMap)) {
    if (!order.includes(sku)) order.push(sku);
  }

  const bySkuLine = Object.create(null);
  const lines = order.map((sku) => {
    const price = bySku[sku] ? Number(bySku[sku].ptrCase) : NaN;
    const ptrCase = Number.isFinite(price) && price >= 0 ? price : 0;   // unknown sku: no price
    const line = { sku, cases: cartMap[sku], ptrCase, value: cartMap[sku] * ptrCase, freeCases: 0, discount: 0, netValue: 0 };
    bySkuLine[sku] = line;
    return line;
  });

  for (const scheme of Array.isArray(schemeResults) ? schemeResults : []) {
    if (!scheme || typeof scheme !== 'object') continue;
    const free = Number(scheme.freeCases);
    if (typeof scheme.freeSku === 'string' && bySkuLine[scheme.freeSku] && Number.isFinite(free) && free > 0) {
      bySkuLine[scheme.freeSku].freeCases += free;
    }
    spreadDiscount(scheme, bySkuLine);
  }

  const totals = { lines, cases: 0, freeCases: 0, grossValue: 0, discount: 0, netValue: 0 };
  for (const line of lines) {
    line.netValue = line.value - line.discount;
    totals.cases += line.cases;
    totals.freeCases += line.freeCases;
    totals.grossValue += line.value;
    totals.discount += line.discount;
  }
  totals.netValue = totals.grossValue - totals.discount;
  return totals;
}
