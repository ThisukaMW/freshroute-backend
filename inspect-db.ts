import { PrismaClient } from './src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function inspectDatabase() {
  try {
    console.log('📊 Database Inspection\n');
    
    // Get all users
    const users = await prisma.user.findMany({ take: 5 });
    console.log(`✓ Users (showing 5): ${users.length} records found`);
    users.forEach(u => console.log(`  - ${u.email} (${u.role})`));
    
    // Get all drivers
    const drivers = await prisma.driver.findMany({ take: 5 });
    console.log(`\n✓ Drivers (showing 5): ${drivers.length} records found`);
    drivers.forEach(d => console.log(`  - ID: ${d.id}, Status: ${d.status}`));
    
    // Get driver sessions
    const sessions = await prisma.driverSession.findMany({ take: 5 });
    console.log(`\n✓ Driver Sessions (showing 5): ${sessions.length} records found`);
    sessions.forEach(s => console.log(`  - Session: ${s.id}, Driver: ${s.driverId}`));
    
    // Get products
    const products = await prisma.product.findMany({ take: 5 });
    console.log(`\n✓ Products (showing 5): ${products.length} records found`);
    products.forEach(p => console.log(`  - ${p.name}, Stock: ${p.stock}`));
    
    console.log('\n✓ Database connection successful!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

inspectDatabase();
