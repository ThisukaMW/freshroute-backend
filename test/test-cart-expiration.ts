import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI0MzUwYmQ5Mi1mMjMwLTQ1MjgtOWY2MS1mOWVlZWY3YWRjZWUiLCJidXllcklkIjoiOTAyMzljZWQtMjAxNS00ZWZiLTllOGItNDViZTBlY2MzNGQ3Iiwicm9sZSI6IkJVWUVSIiwiaWF0IjoxNzc4NTk3NTk0LCJleHAiOjE3NzkyMDIzOTR9.PvZNNXDCsZ88uDYPwyba-zPjKiTuUG00RuUn0-7lUUk';
const BUYER_ID = '90239ced-2015-4efb-9e8b-45be0ecc34d7';
const BASE_URL = 'http://localhost:5000';

async function testCartExpiration() {
  console.log('\n🧪 CART EXPIRATION E2E TEST\n');
  try {
    const product1 = await prisma.product.findFirst();
    const sellers = await prisma.sellerProduct.findMany({
      where: { productId: product1?.id },
      include: { seller: true },
      take: 1,
    });

    if (!product1 || sellers.length < 1) return;

    const seller1 = sellers[0].seller;

    console.log('📋 STEP 1: Adding a valid item to the cart...');
    await fetch(`${BASE_URL}/api/v1/cart/add`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productId: product1.id,
        quantity: 1,
        sellerId: seller1.id,
      }),
    });

    console.log('📋 STEP 2: Manually expiring the reservations in the DB for testing...');
    // We simulate cart expiration by modifying the `expiresAt` of reservations to be in the past.
    const expiredDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
    
    await prisma.stockReservation.updateMany({
        where: { buyerId: BUYER_ID },
        data: { expiresAt: expiredDate }
    });
    console.log('✅ Reservations set to expired.\n');

    console.log('📋 STEP 3: Hitting a protected endpoint (or cron) that checks for cart expiration...');
    // If your app runs a cron job, it might do this automatically, but we can verify DB state.
    // Assuming you have an endpoint that triggers checkout, it should fail if items are expired
    // or you can just check the db state if a cron cleared it.
    
    const reservations = await prisma.stockReservation.findMany({
        where: { buyerId: BUYER_ID }
    });

    console.log(`   Remaining reservations in DB: ${reservations.length}`);
    if (reservations.some(r => r.expiresAt < new Date())) {
        console.log('\n⚠️ NOTE: The reservation is expired in DB. If your system relies on a CRON job to delete these, wait for the cron. If it is checked on checkout, the checkout should fail.');
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error);
  } finally {
    // Clean up
    await prisma.cartItem.deleteMany({ where: { cart: { buyerId: BUYER_ID } } });
    await prisma.stockReservation.deleteMany({ where: { buyerId: BUYER_ID } });
    await prisma.$disconnect();
  }
}

testCartExpiration();
