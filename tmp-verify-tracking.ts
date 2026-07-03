import { PrismaClient } from "./src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const latestSession = await prisma.driverSession.findFirst({
    orderBy: { startedAt: "desc" },
    select: { id: true, driverId: true, startedAt: true, endedAt: true },
  });

  const latestLocation = await prisma.driverLocation.findFirst({
    where: latestSession ? { sessionId: latestSession.id } : undefined,
    orderBy: { timestamp: "desc" },
    select: {
      id: true,
      sessionId: true,
      latitude: true,
      longitude: true,
      timestamp: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        latestSession,
        latestLocation,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
