export function formatViewerCountFull(viewerCount: number): string {
  return Math.max(0, Math.floor(viewerCount)).toLocaleString();
}

export function formatViewerCount(viewerCount: number): string {
  const safeCount = Math.max(0, Math.floor(viewerCount));

  if (safeCount < 1_000) {
    return String(safeCount);
  }

  if (safeCount < 1_000_000) {
    return formatCompactUnit(safeCount, 1_000, 'K');
  }

  return formatCompactUnit(safeCount, 1_000_000, 'M');
}

function formatCompactUnit(
  value: number,
  divisor: number,
  suffix: string,
): string {
  const rounded = Math.round((value / divisor) * 10) / 10;
  const formatted = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1);

  return `${formatted}${suffix}`;
}
