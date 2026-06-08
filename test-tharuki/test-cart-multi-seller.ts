import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

// ⚠️ UPDATE THIS TOKEN if you get 401 Unauthorized errors
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI0MzUwYmQ5Mi1mMjMwLTQ1MjgtOWY2MS1mOWVlZWY3YWRjZWUiLCJidXllcklkIjoiOTAyMzljZWQtMjAxNS00ZWZiLTllOGItNDViZTBlY2MzNGQ3Iiwicm9sZSI6IkJVWUVSIiwiaWF0IjoxNzc4NTk3NTk0LCJleHAiOjE3NzkyMDIzOTR9.PvZNNXDCsZ88uDYPwyba-zPjKiTuUG00RuUn0-7lUUk';
const BUYER_ID = '90239ced-2015-4efb-9e8b-45be0ecc34d7';
const BASE_URL = 'http://localhost:5000';

const pass = (msg: string) => console.log(`✅ PASS: ${msg}`);
const fail = (msg: string) => console.error(`❌ FAIL: ${msg}`);

async function testMultiSellerCart() {
  console.log('\n🧪 MULTI-SELLER CART E2E TEST\n');
  console.log('Test: Same product from 2 different sellers → should appear as 2 separate cart items\n');

  try {
    // ── Find a product that has at least 2 different sellers ─────────────────
    const productWithMultipleSellers = await prisma.product.findFirst({
      where: {
        sellerProducts: {
          some: { stock: { gt: 0 } },
        },
      },
      include: {
        sellerProducts: {
          where: { stock: { gt: 0 } },
          include: { seller: true },
          take: 2,
        },
      },
    });

    if (!productWithMultipleSellers || productWithMultipleSellers.sellerProducts.length < 2) {
      console.log('⚠️  SKIPPED: No product found with 2 or more sellers that have stock > 0.');
      console.log('   To run this test, ensure at least one product has 2 active sellers with stock.\n');
      return;
    }

    const product = productWithMultipleSellers;
    const sellerProduct1 = product.sellerProducts[0];
    const sellerProduct2 = product.sellerProducts[1];

    console.log('📋 TEST DATA:');
    console.log(`  Product  : ${product.name}`);
    console.log(`  Seller 1 : ${sellerProduct1.seller.businessName} (stock: ${sellerProduct1.stock})`);
    console.log(`  Seller 2 : ${sellerProduct2.seller.businessName} (stock: ${sellerProduct2.stock})\n`);

    // ── STEP 0: Clean up ─────────────────────────────────────────────────────
    await prisma.stockReservation.deleteMany({ where: { buyerId: BUYER_ID } });
    await prisma.cartItem.deleteMany({ where: { cart: { buyerId: BUYER_ID } } });

    // ── STEP 1: Add product from Seller 1 ───────────────────────────────────
    console.log('📋 STEP 1: Adding product from Seller 1...');
    const add1Res = await fetch(`${BASE_URL}/api/v1/cart/add`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId: product.id, quantity: 1, sellerId: sellerProduct1.seller.id }),
    });
    const add1Data = await add1Res.json();
    console.log(`  API Status : ${add1Res.status}`);

    if (add1Res.ok) {
      pass(`Product added from Seller 1 (${sellerProduct1.seller.businessName})\n`);
    } else {
      fail(`Failed to add from Seller 1. ${JSON.stringify(add1Data)}\n`);
      return;
    }

    // ── STEP 2: Add SAME product from Seller 2 ──────────────────────────────
    console.log('📋 STEP 2: Adding SAME product from Seller 2...');
    const add2Res = await fetch(`${BASE_URL}/api/v1/cart/add`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId: product.id, quantity: 2, sellerId: sellerProduct2.seller.id }),
    });
    const add2Data = await add2Res.json();
    console.log(`  API Status : ${add2Res.status}`);

    if (add2Res.ok) {
      pass(`Same product added from Seller 2 (${sellerProduct2.seller.businessName})\n`);
    } else {
      fail(`Failed to add from Seller 2. ${JSON.stringify(add2Data)}\n`);
      return;
    }

    // ── STEP 3: Verify cart has 2 SEPARATE line items ───────────────────────
    console.log('📋 STEP 3: Verifying cart has 2 separate line items...');
    const cartRes = await fetch(`${BASE_URL}/api/v1/cart`, {
      headers: { 'Authorization': `Bearer ${TEST_TOKEN}` },
    });
    const cartData = await cartRes.json();

    const itemsForProduct = cartData.items?.filter((i: any) => i.productId === product.id);

    console.log(`  Total cart items     : ${cartData.items?.length}`);
    console.log(`  Items for this product: ${itemsForProduct?.length}`);
    itemsForProduct?.forEach((item: any, idx: number) => {
      console.log(`    Line ${idx + 1}: sellerId=${item.sellerId} | vendor=${item.vendor} | qty=${item.quantity}`);
    });

    if (itemsForProduct?.length === 2) {
      pass('Same product from 2 sellers correctly appears as 2 separate cart line items.');
    } else {
      fail(`Expected 2 separate line items, but got ${itemsForProduct?.length}.`);
    }

    // ── STEP 4: Verify 2 separate StockReservations in DB ───────────────────
    console.log('\n📋 STEP 4: Verifying 2 StockReservations in database...');
    const reservations = await prisma.stockReservation.findMany({
      where: { buyerId: BUYER_ID, productId: product.id },
    });

    console.log(`  StockReservations in DB: ${reservations.length}`);
    reservations.forEach((r, idx) => {
      console.log(`    Reservation ${idx + 1}: sellerId=${r.sellerId} | qty=${r.quantity} | status=${r.status}`);
    });

    if (reservations.length === 2) {
      pass('2 separate StockReservations created (one per seller).\n');
    } else {
      fail(`Expected 2 StockReservations, got ${reservations.length}.\n`);
    }

    // ── STEP 5: Verify sellers are different ────────────────────────────────
    console.log('📋 STEP 5: Verifying each line item has a different sellerId...');
    if (itemsForProduct?.length === 2) {
      const sellerIds = itemsForProduct.map((i: any) => i.sellerId);
      const uniqueSellerIds = new Set(sellerIds);

      if (uniqueSellerIds.size === 2) {
        pass('Each line item has a unique sellerId — multi-seller isolation is working correctly!\n');
      } else {
        fail('Both line items have the same sellerId — sellers are not isolated!\n');
      }
    }

    // ── FINAL VERDICT ────────────────────────────────────────────────────────
    const allPassed = add1Res.ok && add2Res.ok
      && itemsForProduct?.length === 2
      && reservations.length === 2;

    if (allPassed) {
      console.log('🎉 MULTI-SELLER CART TEST PASSED — Industry-standard multi-seller isolation confirmed!\n');
    } else {
      console.log('⚠️  Some steps failed. Review the output above.\n');
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

testMultiSellerCart();
