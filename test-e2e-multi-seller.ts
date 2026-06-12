import { PrismaClient } from './src/generated/prisma/index.js';

const prisma = new PrismaClient();

// Test token from CartPage.tsx
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5NDFlYWFiMS01YTk1LTQ5MWEtOGNjNS00ZTZhZTgwYjliOTMiLCJidXllcklkIjoiMTZmMGQ0ZDktMTNjYy00ZTQ1LTk0YzMtMDIzNzAwNGJmMDUyIiwicm9sZSI6IkJVWUVSIiwiaWF0IjoxNzc3NTczMTcxLCJleHAiOjE3NzgxNzc5NzF9.MMfECGmt0AqYc86WAfdrPROmmV95hqWkjpUA5xi52Kw';
const BUYER_ID = '16f0d4d9-13cc-4e45-94c3-0237004bf052';
const BASE_URL = 'http://localhost:5000';

async function testMultiSellerFlow() {
  console.log('\n🧪 MULTI-SELLER CART E2E TEST\n');

  try {
    // Step 1: Get a product
    console.log('📋 Step 1: Finding a product...');
    const product = await prisma.product.findFirst();
    if (!product) {
      console.error('❌ No product found');
      return;
    }
    console.log(`✅ Product: ${product.name} (ID: ${product.id})`);

    // Step 2: Find two different sellers for this product
    console.log('\n📋 Step 2: Finding two sellers for this product...');
    const sellerProducts = await prisma.sellerProduct.findMany({
      where: { productId: product.id },
      include: { seller: true },
      take: 2,
    });

    if (sellerProducts.length < 2) {
      console.error('❌ Not enough sellers offering this product');
      return;
    }

    const seller1 = sellerProducts[0].seller;
    const seller2 = sellerProducts[1].seller;
    console.log(`✅ Seller 1: ${seller1.businessName} (ID: ${seller1.id})`);
    console.log(`✅ Seller 2: ${seller2.businessName} (ID: ${seller2.id})`);

    // Step 3: Clear existing cart
    console.log('\n📋 Step 3: Clearing existing cart...');
    await prisma.cartItem.deleteMany({
      where: {
        cart: { buyerId: BUYER_ID },
      },
    });
    console.log('✅ Cart cleared');

    // Step 4: Add product from Seller 1
    console.log(`\n📋 Step 4: Adding product from Seller 1 via API...`);
    const addResponse1 = await fetch(`${BASE_URL}/api/v1/cart/add`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productId: product.id,
        quantity: 2,
        sellerId: seller1.id,
      }),
    });

    if (!addResponse1.ok) {
      const error = await addResponse1.json();
      console.error(`❌ Failed to add from seller 1:`, error);
      return;
    }
    const addResult1 = await addResponse1.json();
    console.log(`✅ Added from Seller 1: ${addResult1.message}`);

    // Step 5: Add SAME product from Seller 2
    console.log(`\n📋 Step 5: Adding SAME product from Seller 2 via API...`);
    const addResponse2 = await fetch(`${BASE_URL}/api/v1/cart/add`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productId: product.id,
        quantity: 1,
        sellerId: seller2.id,
      }),
    });

    if (!addResponse2.ok) {
      const error = await addResponse2.json();
      console.error(`❌ Failed to add from seller 2:`, error);
      return;
    }
    const addResult2 = await addResponse2.json();
    console.log(`✅ Added from Seller 2: ${addResult2.message}`);

    // Step 6: Fetch cart via API
    console.log(`\n📋 Step 6: Fetching cart via API...`);
    const getResponse = await fetch(`${BASE_URL}/api/v1/cart`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
      },
    });

    if (!getResponse.ok) {
      const error = await getResponse.json();
      console.error(`❌ Failed to get cart:`, error);
      return;
    }
    const cartData = await getResponse.json();
    console.log(`✅ Cart fetched with ${cartData.items.length} items`);
    cartData.items.forEach((item: any, idx: number) => {
      console.log(`   Item #${idx + 1}: ${item.name} | seller: ${item.vendor} | qty: ${item.quantity} | sellerId: ${item.sellerId}`);
    });

    if (cartData.items.length === 2) {
      console.log('\n✅✅✅ SUCCESS! Two separate items in cart!');
    } else {
      console.log(`\n❌ FAILURE! Expected 2 items, got ${cartData.items.length}`);
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testMultiSellerFlow();
