// // import { PrismaClient } from "../generated/prisma/client.js";
// // import { PrismaPg } from "@prisma/adapter-pg";
// // import dotenv from "dotenv";

// // dotenv.config();

// // const connectionString = process.env.DATABASE_URL!;
// // const adapter = new PrismaPg({ connectionString });
// // const prisma = new PrismaClient({ adapter });

// // export default prisma;
// import { PrismaClient } from "../generated/prisma/client.js";
// import { PrismaPg } from "@prisma/adapter-pg";
// import dotenv from "dotenv";

// dotenv.config();

// const connectionString = process.env.DATABASE_URL!;
// const adapter = new PrismaPg({ connectionString });
// const prisma = new PrismaClient({ adapter });

// export default prisma;


import { PrismaClient } from "../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

export default prisma;