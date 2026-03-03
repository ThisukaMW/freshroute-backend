import { io as connectSocket } from "socket.io-client";
import * as dotenv from "dotenv";

dotenv.config();

// ─── Configuration (overridable via .env) ─────────────────────────────────────

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:5000";
const DRIVER_EMAIL = process.env.SIM_EMAIL ?? "mike@freshroute.com";
const DRIVER_PASSWORD = process.env.SIM_PASSWORD ?? "driver123";
const EMIT_INTERVAL_MS = 3000;

// ─── Colombo road coordinates (25 waypoints) ──────────────────────────────────
// Realistic delivery route through central Colombo:
// Fort → Pettah → Maradana → Borella → Narahenpita → Nugegoda →
// Dehiwala → Wellawatta → Pamankada → Kollupitiya → Bambalapitiya →
// Havelock Town → Kirulapona → Thurstan → Slave Island →
// Union Place → Beira Lake → Galle Face → back to Fort

const COLOMBO_COORDINATES = [
  { latitude: 6.9355, longitude: 79.8503 }, // Colombo Fort
  { latitude: 6.9317, longitude: 79.8478 }, // Pettah Market
  { latitude: 6.9275, longitude: 79.8617 }, // Maradana
  { latitude: 6.9208, longitude: 79.8698 }, // Borella Junction
  { latitude: 6.9108, longitude: 79.8745 }, // Narahenpita
  { latitude: 6.8999, longitude: 79.8821 }, // Nugegoda
  { latitude: 6.8847, longitude: 79.8871 }, // Dehiwala
  { latitude: 6.8753, longitude: 79.8647 }, // Wellawatta Beach
  { latitude: 6.8812, longitude: 79.8588 }, // Pamankada
  { latitude: 6.8934, longitude: 79.8531 }, // Kollupitiya
  { latitude: 6.8974, longitude: 79.8561 }, // Bambalapitiya
  { latitude: 6.9001, longitude: 79.8612 }, // Havelock Town
  { latitude: 6.8901, longitude: 79.8694 }, // Kirulapona
  { latitude: 6.9071, longitude: 79.8612 }, // Thurstan Road
  { latitude: 6.9112, longitude: 79.8553 }, // Slave Island
  { latitude: 6.9183, longitude: 79.8531 }, // Union Place
  { latitude: 6.9217, longitude: 79.8514 }, // Beira Lake South
  { latitude: 6.9271, longitude: 79.8512 }, // Galle Face Green
  { latitude: 6.9312, longitude: 79.8487 }, // Kompanna Veediya
  { latitude: 6.9338, longitude: 79.8401 }, // Grandpass
  { latitude: 6.9401, longitude: 79.8478 }, // Kotahena
  { latitude: 6.9447, longitude: 79.8531 }, // Mutwal
  { latitude: 6.9502, longitude: 79.8612 }, // Mattakkuliya
  { latitude: 6.9447, longitude: 79.8621 }, // Modera
  { latitude: 6.9355, longitude: 79.8503 }, // Back to Colombo Fort
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoginResponse {
  token: string;
  driver: { id: string; name: string };
}

interface SessionStartedPayload {
  sessionId: string;
}

interface ErrorPayload {
  event: string;
  message: string;
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function loginDriver(): Promise<LoginResponse> {
  console.log(`[sim] Logging in as ${DRIVER_EMAIL} ...`);

  const res = await fetch(`${SERVER_URL}/api/v1/auth/driver/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: DRIVER_EMAIL, password: DRIVER_PASSWORD }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed (HTTP ${res.status}): ${body}`);
  }

  return res.json() as Promise<LoginResponse>;
}

// ─── Bearing calculation ──────────────────────────────────────────────────────
// Computes the compass heading (0–360°) from one coordinate to the next.
// Produces realistic heading values rather than random numbers.

function calculateHeading(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number {
  const dLng = to.longitude - from.longitude;
  const y = Math.sin(dLng) * Math.cos(to.latitude);
  const x =
    Math.cos(from.latitude) * Math.sin(to.latitude) -
    Math.sin(from.latitude) * Math.cos(to.latitude) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

// ─── Main simulation ──────────────────────────────────────────────────────────

async function runSimulator(): Promise<void> {
  const { token, driver } = await loginDriver();
  console.log(`[sim] Logged in as "${driver.name}"`);
  console.log(`[sim] Connecting to ${SERVER_URL} ...`);

  const socket = connectSocket(SERVER_URL, {
    auth: { token },
    reconnection: false,
  });

  // ── connect_error ───────────────────────────────────────────────────────────
  socket.on("connect_error", (err: Error) => {
    console.error(`[sim] Connection error: ${err.message}`);
    process.exit(1);
  });

  // ── connect ─────────────────────────────────────────────────────────────────
  socket.on("connect", () => {
    console.log(`[sim] Connected | socket.id=${socket.id}`);
    console.log("[sim] Starting session ...");
    socket.emit("driver:session:start", {});
  });

  // ── driver:session:started ──────────────────────────────────────────────────
  socket.on("driver:session:started", ({ sessionId }: SessionStartedPayload) => {
    console.log(`[sim] Session started | sessionId=${sessionId}`);
    console.log(
      `[sim] Sending ${COLOMBO_COORDINATES.length} location pings every ${EMIT_INTERVAL_MS}ms\n`
    );

    let index = 0;

    const interval = setInterval(() => {
      if (index >= COLOMBO_COORDINATES.length) {
        clearInterval(interval);
        console.log("\n[sim] All coordinates sent. Ending session ...");
        socket.emit("driver:session:end", { sessionId });
        return;
      }

      const coord = COLOMBO_COORDINATES[index]!;
      const heading =
        index === 0
          ? 0
          : calculateHeading(COLOMBO_COORDINATES[index - 1]!, coord);

      const payload = {
        sessionId,
        latitude: coord.latitude,
        longitude: coord.longitude,
        accuracy: parseFloat((4 + Math.random() * 8).toFixed(1)),
        heading: parseFloat(heading.toFixed(1)),
        speed: parseFloat((15 + Math.random() * 30).toFixed(1)),
      };

      console.log(
        `[sim] Ping ${index + 1}/${COLOMBO_COORDINATES.length} | ` +
        `lat=${payload.latitude.toFixed(5)} lng=${payload.longitude.toFixed(5)} | ` +
        `speed=${payload.speed} km/h heading=${payload.heading}°`
      );

      socket.emit("driver:location:update", payload);
      index++;
    }, EMIT_INTERVAL_MS);
  });

  // ── driver:session:ended ────────────────────────────────────────────────────
  socket.on("driver:session:ended", () => {
    console.log("[sim] Session ended. Disconnecting.");
    socket.disconnect();
    process.exit(0);
  });

  // ── error ───────────────────────────────────────────────────────────────────
  socket.on("error", (err: ErrorPayload) => {
    console.error(`[sim] Error on "${err.event}": ${err.message}`);
  });
}

// ─── Entry point ──────────────────────────────────────────────────────────────

runSimulator().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[sim] Fatal: ${message}`);
  process.exit(1);
});
