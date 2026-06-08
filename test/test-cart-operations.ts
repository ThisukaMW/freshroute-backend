import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

// ⚠️ UPDATE THIS TOKEN if you get 401 Unauthorized errors
// Get a fresh token by logging in via POST /api/v1/auth/login
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI0MzUwYmQ5Mi1mMjMwLTQ1MjgtOWY2MS1mOWVlZWY3YWRjZWUiLCJidXllcklkIjoiOTAyMzljZWQtMjAxNS00ZWZiLTllOGItNDViZTBlY2MzNGQ3Iiwicm9sZSI6IkJVWUVSIiwiaWF0IjoxNzc4NTk3NTk0LCJleHAiOjE3NzkyMDIzOTR9.PvZNNXDCsZ88uDYPwyba-zPjKiTuUG00RuUn0-7lUUk';
const BUYER_ID = '90239ced-2015-4efb-9e8b-45be0ecc34d7';
const BASE_URL = 'http://localhost:5000';

const log = (msg: string) => console.log(msg);
const pass = (msg: string) => console.log(`✅ PASS: ${msg}`);
const fail = (msg: string) => console.error(`❌ FAIL: ${msg}`);

async function testCartOperations() {
  log('\n🧪 CART OPERATIONS E2E TEST (HAPPY PATH)\n');
  log('Tests: Add → Get Cart → Update Quantity → Remove Item\n');

  try {
    // ── Fetch test data from DB ──────────────────────────────────────────────
    const sellerProduct = await prisma.sellerProduct.findFirst({
      where: { stock: { gt: 5 } },
      include: { seller: true, product: true },
    });

    if (!sellerProduct) {
      fail('No sellerProduct with stock > 5 found. Please seed the database.');
      return;
    }

    const { product, seller } = sellerProduct;
    log('📋 TEST DATA:');
    log(`  Product : ${product.name}`);
    log(`  Seller  : ${seller.businessName}`);
    log(`  Stock   : ${sellerProduct.stock}\n`);

    // ── STEP 0: Clean up any leftovers from previous test runs ───────────────
    log('📋 STEP 0: Cleaning up previous cart state...');
    await prisma.stockReservation.deleteMany({ where: { buyerId: BUYER_ID } });
    await prisma.cartItem.deleteMany({ where: { cart: { buyerId: BUYER_ID } } });
    log('  Cart cleaned.\n');

    // ── STEP 1: Add item to cart ─────────────────────────────────────────────
    log('📋 STEP 1: Adding item to cart (quantity: 2)...');
    const addRes = await fetch(`${BASE_URL}/api/v1/cart/add`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId: product.id, quantity: 2, sellerId: seller.id }),
    });

    const addData = await addRes.json();
    log(`  API Status : ${addRes.status}`);

    if (addRes.ok && addData.item?.id) {
      pass('Item added to cart successfully.');
      log(`  Cart Item ID  : ${addData.item.id}`);
      log(`  Reservation   : ${addData.reservation?.status} (expires: ${addData.reservation?.expiresAt})\n`);
    } else {
      fail(`Add to cart failed. Response: ${JSON.stringify(addData)}`);
      return;
    }

    // ── STEP 2: Get cart and verify item exists ──────────────────────────────
    log('📋 STEP 2: Fetching cart via API...');
    const getRes = await fetch(`${BASE_URL}/api/v1/cart`, {
      headers: { 'Authorization': `Bearer ${TEST_TOKEN}` },
    });
    const cartData = await getRes.json();

    log(`  API Status  : ${getRes.status}`);
    log(`  Items count : ${cartData.items?.length}`);
    log(`  Subtotal    : ${cartData.subtotal}`);
    log(`  Tax (10%)   : ${cartData.tax}`);
    log(`  Total       : ${cartData.total}`);

    const addedItem = cartData.items?.find(
      (i: any) => i.productId === product.id && i.sellerId === seller.id
    );

    if (addedItem && addedItem.quantity === 2) {
      pass('Cart returned correct item with correct quantity (2).\n');
    } else {
      fail(`Item not found in cart or wrong quantity. Got: ${JSON.stringify(addedItem)}\n`);
    }

    // ── STEP 3: Update quantity ──────────────────────────────────────────────
    log('📋 STEP 3: Updating item quantity to 3...');
    const updateRes = await fetch(`${BASE_URL}/api/v1/cart`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId: product.id, quantity: 3, sellerId: seller.id }),
    });
    const updateData = await updateRes.json();
    log(`  API Status : ${updateRes.status}`);

    if (updateRes.ok && updateData.quantity === 3) {
      pass('Item quantity updated to 3 successfully.\n');
    } else {
      fail(`Quantity update failed. Response: ${JSON.stringify(updateData)}\n`);
    }

    // ── STEP 4: Remove item from cart ────────────────────────────────────────
    log('📋 STEP 4: Removing item from cart...');
    const removeRes = await fetch(
      `${BASE_URL}/api/v1/cart/${product.id}?sellerId=${seller.id}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${TEST_TOKEN}` },
      }
    );
    log(`  API Status : ${removeRes.status}`);

    // Verify item is gone from DB
    const remainingItems = await prisma.cartItem.findMany({
      where: { cart: { buyerId: BUYER_ID }, productId: product.id },
    });
    const remainingReservations = await prisma.stockReservation.findMany({
      where: { buyerId: BUYER_ID, productId: product.id },
    });

    if (remainingItems.length === 0) {
      pass('CartItem removed from database.');
    } else {
      fail(`CartItem still exists in database after removal!`);
    }

    if (remainingReservations.length === 0) {
      pass('StockReservation cascade-deleted after CartItem removal.\n');
    } else {
      fail(`StockReservation still exists after CartItem removal!\n`);
    }

    // ── FINAL VERDICT ────────────────────────────────────────────────────────
    const allPassed = addRes.ok && getRes.ok && updateRes.ok
      && remainingItems.length === 0 && remainingReservations.length === 0;

    if (allPassed) {
      log('🎉 ALL STEPS PASSED — Cart Operations Happy Path is working correctly!\n');
    } else {
      log('⚠️  Some steps failed. Review the output above.\n');
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error);
  } finally {
    // Clean up
    await prisma.stockReservation.deleteMany({ where: { buyerId: BUYER_ID } });
    await prisma.cartItem.deleteMany({ where: { cart: { buyerId: BUYER_ID } } });
    await prisma.$disconnect();
  }
}

testCartOperations();
