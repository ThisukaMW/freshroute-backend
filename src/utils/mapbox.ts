export async function fetchMatrix(coords: Array<[number, number]>) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) throw new Error("MAPBOX_TOKEN not configured");

  const coordStr = coords.map((c) => `${c[0]},${c[1]}`).join(";");
  const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordStr}?annotations=duration,distance&access_token=${token}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox matrix error: ${res.status}`);
  const data = await res.json();

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

  return { durations: durationsFlat, distances: distancesFlat };
}
