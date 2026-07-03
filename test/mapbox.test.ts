import test, { mock } from "node:test";
import assert from "node:assert/strict";

const originalToken = process.env.MAPBOX_TOKEN;

test.afterEach(() => {
  mock.restoreAll();
});

test.after(() => {
  process.env.MAPBOX_TOKEN = originalToken;
});

test("fetchMatrix flattens Mapbox matrices and caches the result", async () => {
  process.env.MAPBOX_TOKEN = "test-token";

  let fetchCalls = 0;
  mock.method(globalThis, "fetch", async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({
        durations: [
          [0, 11],
          [22, 0],
        ],
        distances: [
          [0, 101],
          [202, 0],
        ],
      }),
    } as Response;
  });

  const { fetchMatrix } = await import("../src/utils/mapbox.js");
  const coords: Array<[number, number]> = [
    [-74.006, 40.7128],
    [-73.9352, 40.7306],
  ];

  const first = await fetchMatrix(coords, { cacheTtlMs: 60_000 });
  const second = await fetchMatrix(coords, { cacheTtlMs: 60_000 });

  assert.deepEqual(first, {
    durations: [0, 11, 22, 0],
    distances: [0, 101, 202, 0],
  });
  assert.deepEqual(second, first);
  assert.equal(fetchCalls, 1);
});

test("fetchMatrix throws when MAPBOX_TOKEN is missing", async () => {
  delete process.env.MAPBOX_TOKEN;

  const { fetchMatrix } = await import("../src/utils/mapbox.js");

  await assert.rejects(
    () => fetchMatrix([[0, 0], [1, 1]]),
    /MAPBOX_TOKEN not configured/
  );
});