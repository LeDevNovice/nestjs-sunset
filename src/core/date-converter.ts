const UTC_DAYS: readonly string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const UTC_MONTHS: readonly string[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function toDate(value: Date | string | number | undefined): Date | null {
  if (value === undefined) return null;
  if (value instanceof Date) return value;

  return new Date(value);
}

export function toStructuredFieldDate(date: Date): string {
  return `@${String(Math.floor(date.getTime() / 1000))}`;
}

export function toIMFFixdate(date: Date): string {
  const day = UTC_DAYS[date.getUTCDay()];
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const month = UTC_MONTHS[date.getUTCMonth()];
  const year = String(date.getUTCFullYear());
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');

  return `${day}, ${dd} ${month} ${year} ${hh}:${mm}:${ss} UTC`;
}
