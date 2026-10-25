export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isFiniteVector(value: unknown): value is { x: number; y: number; z: number } {
  return isRecord(value) && ['x', 'y', 'z'].every(key =>
    typeof value[key] === 'number' && Number.isFinite(value[key]));
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}
