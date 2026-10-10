// Pure formatters. No locale APIs: Indian digit grouping is done by hand so the output is
// the same in every browser and in Node.

const DASH = '—';   // shown for a missing value
const MINUS = '−';  // true minus sign
const RUPEE = '₹';

// Numbers and numeric strings only. Arrays, blank strings and booleans are not numbers here,
// and neither is anything from 1e21 up, where toFixed() switches to exponent notation.
function toNumber(value) {
  if (typeof value === 'string') {
    if (value.trim() === '') return NaN;
  } else if (typeof value !== 'number') {
    return NaN;
  }
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) < 1e21 ? n : NaN;
}

// '1234567' → '12,34,567': the last three digits, then groups of two.
function groupIndian(digits) {
  if (digits.length <= 3) return digits;
  const tail = digits.slice(-3);
  let head = digits.slice(0, -3);
  const groups = [];
  while (head.length > 2) {
    groups.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head) groups.unshift(head);
  return groups.join(',') + ',' + tail;
}

function grouped(n, decimals) {
  const places = Math.max(0, Math.min(6, Math.floor(toNumber(decimals)) || 0));
  const fixed = Math.abs(n).toFixed(places);
  const isZero = Number(fixed) === 0;                 // avoids '−0'
  const dot = fixed.indexOf('.');
  const whole = dot === -1 ? fixed : fixed.slice(0, dot);
  const fraction = dot === -1 ? '' : fixed.slice(dot);
  return { negative: n < 0 && !isZero, text: groupIndian(whole) + fraction };
}

// '₹12,450'. Indian grouping, rounded to whole rupees; negative → '−₹500'; null/NaN → '—'.
export function inr(amount) {
  const n = toNumber(amount);
  if (Number.isNaN(n)) return DASH;
  const g = grouped(n, 0);
  return (g.negative ? MINUS : '') + RUPEE + g.text;
}

// '1,23,456'. Indian grouping with a fixed number of decimals; null/NaN → '—'.
export function num(n, decimals = 0) {
  const value = toNumber(n);
  if (Number.isNaN(value)) return DASH;
  const g = grouped(value, decimals);
  return (g.negative ? MINUS : '') + g.text;
}

// '1 case' | '5 cases' | '2.5 cases'. One decimal only when n is not whole.
export function casesLabel(n) {
  const value = toNumber(n);
  if (Number.isNaN(value)) return DASH;
  const rounded = Math.round(value * 10) / 10;
  const whole = Number.isInteger(rounded);
  return num(rounded, whole ? 0 : 1) + (rounded === 1 ? ' case' : ' cases');
}

// plural(2, 'outlet', 'outlets') → '2 outlets'; plural(1, 'outlet', 'outlets') → '1 outlet'.
export function plural(n, one, many) {
  const value = toNumber(n);
  if (Number.isNaN(value)) return DASH + ' ' + many;
  const decimals = Number.isInteger(value) ? 0 : 1;
  return num(value, decimals) + ' ' + (value === 1 ? one : many);
}
