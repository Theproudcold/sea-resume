export function formatResumeDate(value: string | undefined, format: string): string {
  if (!value) return '';
  const match = value.match(/^(\d{4})[-/.](\d{1,2})(?:\D|$)/);
  if (!match) return value;
  const [, year, monthValue] = match;
  const month = Number(monthValue);
  if (!year || month < 1 || month > 12) return value;
  const paddedMonth = String(month).padStart(2, '0');
  const shortMonth = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1] ?? paddedMonth;
  switch (format) {
    case 'YYYY-MM': return `${year}-${paddedMonth}`;
    case 'YYYY/MM': return `${year}/${paddedMonth}`;
    case 'MM/YYYY': return `${paddedMonth}/${year}`;
    case 'MMM YYYY': return `${shortMonth} ${year}`;
    case 'YYYY.MM': default: return `${year}.${paddedMonth}`;
  }
}

export function formatResumeDateRange(start: string, end: string, format: string): string {
  const startDate = formatResumeDate(start, format);
  const endDate = end === 'present' ? '至今' : formatResumeDate(end, format);
  return [startDate, endDate].filter(Boolean).join(' - ');
}
