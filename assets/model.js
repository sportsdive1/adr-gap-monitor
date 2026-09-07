export const positive = value => Number.isFinite(value) && value > 0;
export const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) > 0;
export const validQuote = quote => positive(quote?.price) && validTime(quote?.timestamp);
export const validFx = fx => positive(fx?.rates?.KRW) && validTime(fx?.updatedAt);

export function compare(krQuote, usQuote, fx, ratio) {
  if (!validQuote(krQuote) || !validQuote(usQuote) || !positive(fx) || !positive(ratio)) return null;
  const krw = krQuote.price, adr = usQuote.price;
  const fairAdr = krw * ratio / fx, impliedKrw = adr * fx / ratio;
  const koreaGap = (krw / impliedKrw - 1) * 100, adrGap = (adr / fairAdr - 1) * 100;
  if (![fairAdr, impliedKrw].every(positive) || ![koreaGap, adrGap].every(Number.isFinite)) return null;
  return { krw, adr, fairAdr, impliedKrw, koreaGap, adrGap, krwDifference: Math.abs(impliedKrw - krw), usdDifference: Math.abs(adr - fairAdr) };
}

export function money(amount, currency) {
  const digits = currency === 'KRW' ? 0 : 2;
  const formatted = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
  return currency === 'KRW' ? `${formatted}원` : `$${formatted}`;
}

// Keep the existing device-local display and US session-label policy unchanged.
export const timeLabel = value => validTime(value) ? new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '확인 중';
export function quoteSessionLabel(quote) {
  if (!quote.extendedHoursIncluded) return '정규장 시세';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(quote.timestamp));
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const minutes = Number(value.hour) * 60 + Number(value.minute);
  return !['Sat', 'Sun'].includes(value.weekday) && minutes >= 570 && minutes < 960 ? '정규장 시세' : '시간외 시세';
}

export const quoteTime = quote => `기준: ${timeLabel(quote.timestamp)} · ${quoteSessionLabel(quote)}${quote.stale ? ' · 최신 시세 오류 / 이전 시세' : ''}`;
export const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// One denominator for every collapsed card: domestic price converted to one ADR.
export function gapSummary(gap) {
  if (!Number.isFinite(gap)) return '비교 불가';
  const magnitude = Math.abs(gap).toFixed(2);
  return magnitude === '0.00' ? '0.00% · 거의 같음' : `${magnitude}% ${gap > 0 ? '높음' : '낮음'}`;
}

export const PREFERENCES_KEY = 'adrgap.preferences.v1';
export function normalizePreferences(value) {
  const validId = id => typeof id === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(id);
  if (value?.version !== 1) return { version: 1, pinned: [], expanded: {} };
  const pinned = Array.isArray(value.pinned) ? [...new Set(value.pinned.filter(validId))].slice(0, 100) : [];
  const expanded = Object.fromEntries(Object.entries(value.expanded && typeof value.expanded === 'object' ? value.expanded : {})
    .filter(([id, open]) => validId(id) && typeof open === 'boolean').slice(0, 100));
  return { version: 1, pinned, expanded };
}
export function readPreferences(read) {
  try { return normalizePreferences(JSON.parse(read())); } catch { return normalizePreferences(null); }
}
export function writePreferences(write, preferences) {
  try { write(JSON.stringify(normalizePreferences(preferences))); return true; } catch { return false; }
}
