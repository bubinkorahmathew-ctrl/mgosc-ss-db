export function classLabel(c: { name: string; section: string | null }) {
  return c.section ? `${c.name} - ${c.section}` : c.name;
}

/** Builds a teacher URL that keeps the selected class. */
export function withClass(path: string, classId?: string | null) {
  return classId ? `${path}?class=${classId}` : path;
}

export function percent(numerator: number, denominator: number, digits = 1): string {
  if (!denominator) return "-";
  return `${((numerator / denominator) * 100).toFixed(digits)}%`;
}
