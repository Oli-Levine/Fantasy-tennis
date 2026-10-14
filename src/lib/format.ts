/** Prices are stored in £ millions, e.g. 8.5 → "£8.5m". */
export function formatPrice(millions: number): string {
  return `£${(Math.round(millions * 10) / 10).toFixed(1)}m`;
}

/** "Carlos Alcaraz" → "CA", "Alcaraz" → "A". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** "Carlos Alcaraz" → "C.Alcaraz", "Alex de Minaur" → "A.de Minaur". */
export function shortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words[0] ?? "";
  return `${words[0][0]}.${words.slice(1).join(" ")}`;
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
