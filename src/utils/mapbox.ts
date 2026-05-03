type MatrixResponse = {
  durations: number[];
  distances: number[];
};

type FetchMatrixOptions = {
  cacheTtlMs?: number;
};

const MATRIX_CACHE = new Map<string, { expiresAt: number; value: MatrixResponse }>();
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

const buildCacheKey = (coords: Array<[number, number]>) =>
  coords
    .map(([longitude, latitude]) => `${longitude.toFixed(5)},${latitude.toFixed(5)}`)
    .join(";");

export async function fetchMatrix(coords: Array<[number, number]>, options: FetchMatrixOptions = {}) {
  const cacheKey = buildCacheKey(coords);
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cached = MATRIX_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const token = process.env.MAPBOX_TOKEN;
  if (!token) throw new Error("MAPBOX_TOKEN not configured");

  const coordStr = coords.map((c) => `${c[0]},${c[1]}`).join(";");
  const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordStr}?annotations=duration,distance&access_token=${token}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox matrix error: ${res.status}`);
  const data = (await res.json()) as { durations?: number[][]; distances?: number[][] };

  const durationsFlat: number[] = [];
  const distancesFlat: number[] = [];
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const d = data.durations?.[i]?.[j] ?? null;
      const dist = data.distances?.[i]?.[j] ?? null;
      durationsFlat.push(d ?? Infinity);
      distancesFlat.push(dist ?? Infinity);
    }
  }

  const value = { durations: durationsFlat, distances: distancesFlat };
  MATRIX_CACHE.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, value });

  return value;
}
