// Pure ISO-date helpers. Dates are calendar strings 'YYYY-MM-DD' with no time zone.
// Parsing is by string split and arithmetic is by UTC day numbers, so results are the
// same on every device. Nothing here reads the device clock.

const MS_PER_DAY = 86400000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEK_RE = /^(\d{4})-W(\d{2})$/;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

function pad(n, width) {
  let s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

// 'YYYY-MM-DD' → { y, m, d } or null. Rejects impossible dates such as 2026-02-30.
function parts(iso) {
  if (typeof iso !== 'string') return null;
  const match = ISO_RE.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1) return null;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const monthLengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (d > monthLengths[m - 1]) return null;
  return { y, m, d };
}

function dayNumberOf(y, m, d) {
  const date = new Date(Date.UTC(2000, m - 1, d));
  date.setUTCFullYear(y); // Date.UTC maps years 0–99 to 1900–1999; set the year explicitly
  return Math.round(date.getTime() / MS_PER_DAY);
}

function weekdayOfDayNumber(n) {
  return (((n + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday (4)
}

export function isValidISO(iso) {
  return parts(iso) !== null;
}

// Whole days since 1970-01-01. NaN for an invalid date.
export function toDayNumber(iso) {
  const p = parts(iso);
  return p ? dayNumberOf(p.y, p.m, p.d) : NaN;
}

// Null for a non-finite day number, or one outside the years 0000–9999.
export function fromDayNumber(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const date = new Date(Math.round(n) * MS_PER_DAY);
  const year = date.getUTCFullYear();
  if (!(year >= 0 && year <= 9999)) return null; // also catches an out-of-range (invalid) Date
  return pad(date.getUTCFullYear(), 4) + '-' + pad(date.getUTCMonth() + 1, 2) + '-' + pad(date.getUTCDate(), 2);
}

export function addDays(iso, n) {
  const day = toDayNumber(iso);
  const delta = Number(n);
  if (Number.isNaN(day) || !Number.isFinite(delta)) return null;
  return fromDayNumber(day + Math.round(delta));
}

// to − from in days; positive when `to` is later. NaN when either date is invalid.
export function diffDays(from, to) {
  return toDayNumber(to) - toDayNumber(from);
}

// 0 = Sunday … 6 = Saturday. NaN for an invalid date.
export function weekday(iso) {
  const day = toDayNumber(iso);
  return Number.isNaN(day) ? NaN : weekdayOfDayNumber(day);
}

// ISO-8601 week key with the ISO week-year, e.g. '2026-W18'. Null for an invalid date.
export function isoWeek(iso) {
  const day = toDayNumber(iso);
  if (Number.isNaN(day)) return null;
  const mondayOffset = (weekdayOfDayNumber(day) + 6) % 7;      // Monday = 0 … Sunday = 6
  const thursday = day - mondayOffset + 3;                      // the Thursday decides the week-year
  const year = Number(fromDayNumber(thursday).slice(0, 4));
  const week = Math.floor((thursday - dayNumberOf(year, 1, 1)) / 7) + 1;
  return pad(year, 4) + '-W' + pad(week, 2);
}

// Monday of the ISO week containing iso.
export function isoWeekStart(iso) {
  const day = toDayNumber(iso);
  if (Number.isNaN(day)) return null;
  return fromDayNumber(day - ((weekdayOfDayNumber(day) + 6) % 7));
}

// Monday of 'YYYY-Www'. Null for a malformed key or a week the year does not have.
export function isoWeekToStart(weekKey) {
  if (typeof weekKey !== 'string') return null;
  const match = WEEK_RE.exec(weekKey);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const jan4 = dayNumberOf(year, 1, 4);                         // 4 January is always in week 1
  const weekOneMonday = jan4 - ((weekdayOfDayNumber(jan4) + 6) % 7);
  const start = fromDayNumber(weekOneMonday + (week - 1) * 7);
  return isoWeek(start) === weekKey ? start : null;
}

export function monthKey(iso) {
  return parts(iso) ? iso.slice(0, 7) : null;
}

// Inclusive on both ends. False when any of the three dates is invalid.
export function isBetween(iso, start, end) {
  if (!parts(iso) || !parts(start) || !parts(end)) return false;
  return iso >= start && iso <= end;
}

// 'short' → 'Tue 28 Apr' · 'long' → 'Tue 28 Apr 2026' · 'dm' → '28 Apr'
// 'full' → 'Tuesday, 28 April 2026' · 'day' → 'Tuesday'. Empty string for an invalid date.
export function formatDate(iso, style = 'short') {
  const p = parts(iso);
  if (!p) return '';
  const dayName = DAY_NAMES[weekdayOfDayNumber(dayNumberOf(p.y, p.m, p.d))];
  const monthName = MONTH_NAMES[p.m - 1];
  const dayShort = dayName.slice(0, 3);
  const monthShort = monthName.slice(0, 3);
  switch (style) {
    case 'long': return dayShort + ' ' + p.d + ' ' + monthShort + ' ' + p.y;
    case 'dm': return p.d + ' ' + monthShort;
    case 'full': return dayName + ', ' + p.d + ' ' + monthName + ' ' + p.y;
    case 'day': return dayName;
    case 'short':
    default: return dayShort + ' ' + p.d + ' ' + monthShort;
  }
}

// 'Today' · 'Tomorrow' · 'Yesterday' · 'in 7 days' · '7 days ago'. Empty string for an invalid date.
export function relativeDay(iso, demoDate) {
  const delta = diffDays(demoDate, iso);
  if (Number.isNaN(delta)) return '';
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  return delta > 0 ? 'in ' + delta + ' days' : (-delta) + ' days ago';
}
