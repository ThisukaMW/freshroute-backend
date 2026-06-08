import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

// ⚠️ UPDATE THIS TOKEN if you get 401 Unauthorized errors
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI0MzUwYmQ5Mi1mMjMwLTQ1MjgtOWY2MS1mOWVlZWY3YWRjZWUiLCJidXllcklkIjoiOTAyMzljZWQtMjAxNS00ZWZiLTllOGItNDViZTBlY2MzNGQ3Iiwicm9sZSI6IkJVWUVSIiwiaWF0IjoxNzc4NTk3NTk0LCJleHAiOjE3NzkyMDIzOTR9.PvZNNXDCsZ88uDYPwyba-zPjKiTuUG00RuUn0-7lUUk';
const BUYER_ID = '90239ced-2015-4efb-9e8b-45be0ecc34d7';
const BASE_URL = 'http://localhost:5000';

const pass = (msg: string) => console.log(`✅ PASS: ${msg}`);
const fail = (msg: string) => console.error(`❌ FAIL: ${msg}`);

async function testCartTotals() {
  console.log('\n🧪 CART TOTALS & PROMO CODE E2E TEST\n');
  console.log('Tests: Add item → Verify subtotal/tax/total → Apply promo → Verify discount\n');

  try {
    // ── Fetch test data from DB ──────────────────────────────────────────────
    const sellerProduct = await prisma.sellerProduct.findFirst({
      where: { stock: { gt: 5 } },
      include: { seller: true, product: true },
    });

    if (!sellerProduct) {
      fail('No seller product with stock > 5 found. Seed the database first.');
      return;
    }

    // Look for an active promo code
    const promo = await prisma.promoCode.findFirst({ where: { active: true } });

    const { product, seller } = sellerProduct;
    const QUANTITY = 3;
    const PRICE = product.price;

    console.log('📋 TEST DATA:');
    console.log(`  Product  : ${product.name}`);
    console.log(`  Seller   : ${seller.businessName}`);
    console.log(`  Price    : ${PRICE} per unit`);
    console.log(`  Quantity : ${QUANTITY}`);
    console.log(`  Promo    : ${promo ? `${promo.code} (${promo.discount}% off)` : 'No active promo found'}\n`);

    // ── STEP 0: Clean up ─────────────────────────────────────────────────────
    await prisma.stockReservation.deleteMany({ where: { buyerId: BUYER_ID } });
    await prisma.cartItem.deleteMany({ where: { cart: { buyerId: BUYER_ID } } });
    // Remove any previously applied promo from cart
    await prisma.cart.updateMany({ where: { buyerId: BUYER_ID }, data: { promoCodeId: null } });

    // ── STEP 1: Add item to cart ─────────────────────────────────────────────
    console.log('📋 STEP 1: Adding item to cart...');
    const addRes = await fetch(`${BASE_URL}/api/v1/cart/add`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId: product.id, quantity: QUANTITY, sellerId: seller.id }),
    });

    if (!addRes.ok) {
      const err = await addRes.json();
      fail(`Failed to add item. ${JSON.stringify(err)}`);
      return;
    }
    pass('Item added successfully.\n');

    // ── STEP 2: Verify cart totals WITHOUT promo ─────────────────────────────
    console.log('📋 STEP 2: Verifying cart totals (no promo)...');
    const cartRes = await fetch(`${BASE_URL}/api/v1/cart`, {
      headers: { 'Authorization': `Bearer ${TEST_TOKEN}` },
    });
    const cartData = await cartRes.json();

    const expectedSubtotal = PRICE * QUANTITY;
    const expectedTax = expectedSubtotal * 0.1;
    const expectedTotal = expectedSubtotal + expectedTax;

    console.log(`  Expected subtotal : ${expectedSubtotal.toFixed(2)}`);
    console.log(`  API subtotal      : ${cartData.subtotal}`);
    console.log(`  Expected tax (10%): ${expectedTax.toFixed(2)}`);
    console.log(`  API tax           : ${cartData.tax}`);
    console.log(`  Expected total    : ${expectedTotal.toFixed(2)}`);
    console.log(`  API total         : ${cartData.total}`);

    const subtotalCorrect = Math.abs(cartData.subtotal - expectedSubtotal) < 0.01;
    const taxCorrect = Math.abs(cartData.tax - expectedTax) < 0.01;
    const totalCorrect = Math.abs(cartData.total - expectedTotal) < 0.01;

    if (subtotalCorrect) pass('Subtotal calculated correctly.');
    else fail(`Subtotal mismatch! Expected: ${expectedSubtotal}, Got: ${cartData.subtotal}`);

    if (taxCorrect) pass('Tax (10%) calculated correctly.');
    else fail(`Tax mismatch! Expected: ${expectedTax}, Got: ${cartData.tax}`);

    if (totalCorrect) pass('Total (subtotal + tax) calculated correctly.\n');
    else fail(`Total mismatch! Expected: ${expectedTotal}, Got: ${cartData.total}\n`);

    // ── STEP 3: Apply promo code (if one exists) ─────────────────────────────
    if (promo) {
      console.log(`📋 STEP 3: Applying promo code "${promo.code}" (${promo.discount}% discount)...`);
      const promoRes = await fetch(`${BASE_URL}/api/v1/cart/apply-promo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: promo.code }),
      });
      const promoData = await promoRes.json();
      console.log(`  API Status : ${promoRes.status}`);

      if (!promoRes.ok) {
        fail(`Promo apply failed. ${JSON.stringify(promoData)}\n`);
      } else {
        pass('Promo code applied successfully.');

        // Fetch cart again to check discount
        const cartAfterPromo = await fetch(`${BASE_URL}/api/v1/cart`, {
          headers: { 'Authorization': `Bearer ${TEST_TOKEN}` },
        });
        const cartPromoData = await cartAfterPromo.json();

        const expectedDiscount = expectedSubtotal * (promo.discount / 100);
        const expectedTotalWithPromo = expectedSubtotal + expectedTax - expectedDiscount;

        console.log(`  Expected discount : ${expectedDiscount.toFixed(2)}`);
        console.log(`  API discount      : ${cartPromoData.discount}`);
        console.log(`  Expected total    : ${expectedTotalWithPromo.toFixed(2)}`);
        console.log(`  API total         : ${cartPromoData.total}`);

        if (Math.abs(cartPromoData.discount - expectedDiscount) < 0.01) {
          pass(`Discount (${promo.discount}%) applied correctly.`);
        } else {
          fail(`Discount mismatch! Expected: ${expectedDiscount}, Got: ${cartPromoData.discount}`);
        }

        if (Math.abs(cartPromoData.total - expectedTotalWithPromo) < 0.01) {
          pass(`Total after promo is correct.\n`);
        } else {
          fail(`Total after promo mismatch! Expected: ${expectedTotalWithPromo}, Got: ${cartPromoData.total}\n`);
        }
      }
    } else {
      console.log('⚠️  STEP 3 SKIPPED: No active promo code found in database.\n');
      console.log('   To test promo codes, add an active PromoCode record to the DB.\n');
    }

    console.log('🎉 CART TOTALS TEST COMPLETE\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error);
  } finally {
    // Clean up
    await prisma.stockReservation.deleteMany({ where: { buyerId: BUYER_ID } });
    await prisma.cartItem.deleteMany({ where: { cart: { buyerId: BUYER_ID } } });
    await prisma.cart.updateMany({ where: { buyerId: BUYER_ID }, data: { promoCodeId: null } });
    await prisma.$disconnect();
  }
}

testCartTotals();
