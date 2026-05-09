import prisma from "./src/config/database.js";

const VALID_STATUSES = new Set([
  "PLANNED",
  "ASSIGNED",
  "STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

type Command = "list" | "set-status";

const args = process.argv.slice(2);
const command = args[0] as Command | undefined;

const getArg = (name: string) => {
  const prefix = `--${name}=`;
  const found = args.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
};

async function listRoutes() {
  const batchId = getArg("batchId");
  const routeId = getArg("routeId");

  const routes = await prisma.route.findMany({
    where: {
      ...(batchId ? { batchId } : {}),
      ...(routeId ? { id: routeId } : {}),
    },
    select: {
      id: true,
      routeNumber: true,
      batchId: true,
      driverId: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      actualStart: true,
      actualEnd: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(JSON.stringify(routes, null, 2));
}

async function setStatus() {
  const routeId = getArg("routeId");
  const status = getArg("status")?.toUpperCase();
  const actualEnd = getArg("actualEnd");

  if (!routeId) {
    throw new Error("Missing --routeId=<id>");
  }

  if (!status || !VALID_STATUSES.has(status)) {
    throw new Error(
      `Missing or invalid --status=<status>. Allowed: ${Array.from(VALID_STATUSES).join(", ")}`
    );
  }

  const updated = await prisma.route.update({
    where: { id: routeId },
    data: {
      status: status as any,
      ...(actualEnd ? { actualEnd: new Date(actualEnd) } : {}),
    },
    select: {
      id: true,
      routeNumber: true,
      batchId: true,
      driverId: true,
      status: true,
      actualStart: true,
      actualEnd: true,
      updatedAt: true,
    },
  });

  console.log(JSON.stringify(updated, null, 2));
}

async function main() {
  if (command === "list") {
    await listRoutes();
    return;
  }

  if (command === "set-status") {
    await setStatus();
    return;
  }

  console.log(`Usage:\n  tsx tmp-route-admin.ts list --batchId=<batchId>\n  tsx tmp-route-admin.ts list --routeId=<routeId>\n  tsx tmp-route-admin.ts set-status --routeId=<routeId> --status=COMPLETED [--actualEnd=2026-05-08T12:00:00.000Z]`);
}

main()
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
