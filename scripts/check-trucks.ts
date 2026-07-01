import prisma from '../src/config/database.js';

(async () => {
  try {
    const count = await prisma.truck.count();
    console.log('TRUCK COUNT:', count);
  } catch (e) {
    console.error('ERROR', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
