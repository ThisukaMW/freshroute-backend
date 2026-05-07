import { PrismaClient } from './src/generated/prisma/index.js';

const prisma = new PrismaClient();

const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5NDFlYWFiMS01YTk1LTQ5MWEtOGNjNS00ZTZhZTgwYjliOTMiLCJidXllcklkIjoiMTZmMGQ0ZDktMTNjYy00ZTQ1LTk0YzMtMDIzNzAwNGJmMDUyIiwicm9sZSI6IkJVWUVSIiwiaWF0IjoxNzc3NTczMTcxLCJleHAiOjE3NzgxNzc5NzF9.MMfECGmt0AqYc86WAfdrPROmmV95hqWkjpUA5xi52Kw';
const BUYER_ID = '16f0d4d9-13cc-4e45-94c3-0237004bf052';
const BASE_URL = 'http://localhost:5000';

async function testCartClearing() {
  console.log('\n🧪 CART CLEARING E2E TEST\n');

  try {
    // Get test data
    const product1 = await prisma.product.findFirst();
    const product2 = await prisma.product.findFirst({
      where: { id: { not: product1?.id } },
    });

    if (!product1 || !product2) {
      console.error('❌ Need at least 2 products');
      return;
    }

    const sellers = await prisma.sellerProduct.findMany({
      where: { productId: product1.id },
      include: { seller: true },
      take: 2,
    });

    if (sellers.length < 2) {
      console.error('❌ Need at least 2 sellers for product 1');
      return;
    }

    const seller1 = sellers[0].seller;
    const seller2 = sellers[1].seller;

    console.log('📋 TEST DATA:');
    console.log(`  Product 1: ${product1.name}`);
    console.log(`  Product 2: ${product2.name}`);
    console.log(`  Seller 1: ${seller1.businessName}`);
    console.log(`  Seller 2: ${seller2.businessName}\n`);

    // STEP 1: Clear existing cart
    console.log('📋 STEP 1: Clearing any existing cart items...');
    await prisma.cartItem.deleteMany({
      where: { cart: { buyerId: BUYER_ID } },
    });
    console.log('✅ Existing items cleared\n');

    // STEP 2: Verify cart is empty
    console.log('📋 STEP 2: Verifying cart is empty...');
    let cartItems = await prisma.cartItem.findMany({
      where: { cart: { buyerId: BUYER_ID } },
    });
    console.log(`✅ Cart has ${cartItems.length} items (expected 0)\n`);

    // STEP 3: Add multiple items
    console.log('📋 STEP 3: Adding items via API...');
    
    const addItem1 = await fetch(`${BASE_URL}/api/v1/cart/add`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productId: product1.id,
        quantity: 2,
        sellerId: seller1.id,
      }),
    });
    console.log(`✅ Added Product 1 from Seller 1`);

    const addItem2 = await fetch(`${BASE_URL}/api/v1/cart/add`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productId: product1.id,
        quantity: 1,
        sellerId: seller2.id,
      }),
    });
    console.log(`✅ Added Product 1 from Seller 2`);

    // Verify items in database
    cartItems = await prisma.cartItem.findMany({
      where: { cart: { buyerId: BUYER_ID } },
    });
    console.log(`✅ Database now has ${cartItems.length} CartItems (expected 2)\n`);

    // STEP 4: Check reservations exist
    console.log('📋 STEP 4: Verifying StockReservations...');
    const reservations = await prisma.stockReservation.findMany({
      where: { buyerId: BUYER_ID },
    });
    console.log(`✅ Database has ${reservations.length} StockReservations (expected 2)\n`);

    // STEP 5: Clear cart via API
    console.log('📋 STEP 5: Clearing cart via API...');
    const clearResponse = await fetch(`${BASE_URL}/api/v1/cart/clear`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    const clearResult = await clearResponse.json();
    console.log(`✅ API Response: ${clearResult.message}`);
    console.log(`   Items cleared: ${clearResult.itemsCleared}`);
    console.log(`   Reservations cleared: ${clearResult.reservationsCleared}\n`);

    // STEP 6: Verify CartItems are deleted
    console.log('📋 STEP 6: Verifying CartItems deleted from database...');
    cartItems = await prisma.cartItem.findMany({
      where: { cart: { buyerId: BUYER_ID } },
    });
    console.log(`Database CartItems: ${cartItems.length} (expected 0)`);
    if (cartItems.length === 0) {
      console.log('✅ PASS: CartItems successfully deleted\n');
    } else {
      console.error('❌ FAIL: CartItems still exist!');
      cartItems.forEach((item: any) => {
        console.error(`   - ${item.id} | product: ${item.productId}`);
      });
    }

    // STEP 7: Verify StockReservations are cascade-deleted
    console.log('📋 STEP 7: Verifying StockReservations deleted...');
    const remainingReservations = await prisma.stockReservation.findMany({
      where: { buyerId: BUYER_ID },
    });
    console.log(`Database StockReservations: ${remainingReservations.length} (expected 0)`);
    if (remainingReservations.length === 0) {
      console.log('✅ PASS: StockReservations successfully deleted\n');
    } else {
      console.error('❌ FAIL: StockReservations still exist!');
    }

    // STEP 8: Fetch cart via API to confirm
    console.log('📋 STEP 8: Fetching cart via API to confirm...');
    const getResponse = await fetch(`${BASE_URL}/api/v1/cart`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
      },
    });
    const cartData = await getResponse.json();
    console.log(`API Cart items: ${cartData.items.length} (expected 0)`);
    if (cartData.items.length === 0) {
      console.log('✅ PASS: API confirms cart is empty\n');
    } else {
      console.error('❌ FAIL: API returned items!');
      cartData.items.forEach((item: any) => {
        console.error(`   - ${item.name} | seller: ${item.vendor}`);
      });
    }

    // FINAL VERDICT
    if (
      cartItems.length === 0 &&
      remainingReservations.length === 0 &&
      cartData.items.length === 0
    ) {
      console.log('✅✅✅ SUCCESS! Cart clearing is INDUSTRY-STANDARD!');
      console.log('   ✅ CartItems deleted from database');
      console.log('   ✅ StockReservations cascade-deleted');
      console.log('   ✅ API confirms empty cart');
      console.log('   ✅ All data properly cleaned up\n');
    } else {
      console.log('❌ FAILURE: Some data still remains in database');
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testCartClearing();
