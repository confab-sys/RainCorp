export function normalizeAvailability(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  try {
    if (typeof value === 'object') return JSON.stringify(value);
  } catch (e) {
    // fall through
  }
  return String(value);
}
