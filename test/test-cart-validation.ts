import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI0MzUwYmQ5Mi1mMjMwLTQ1MjgtOWY2MS1mOWVlZWY3YWRjZWUiLCJidXllcklkIjoiOTAyMzljZWQtMjAxNS00ZWZiLTllOGItNDViZTBlY2MzNGQ3Iiwicm9sZSI6IkJVWUVSIiwiaWF0IjoxNzc4NTk3NTk0LCJleHAiOjE3NzkyMDIzOTR9.PvZNNXDCsZ88uDYPwyba-zPjKiTuUG00RuUn0-7lUUk';
const BUYER_ID = '90239ced-2015-4efb-9e8b-45be0ecc34d7';
const BASE_URL = 'http://localhost:5000';

async function testCartValidation() {
  console.log('\n🧪 CART VALIDATION E2E TEST (INSUFFICIENT STOCK)\n');
  try {
    const product1 = await prisma.product.findFirst();
    if (!product1) {
      console.error('❌ Need at least 1 product in DB');
      return;
    }

    const sellers = await prisma.sellerProduct.findMany({
      where: { productId: product1.id },
      include: { seller: true },
      take: 1,
    });

    if (sellers.length < 1) {
      console.error('❌ Need at least 1 seller for the product');
      return;
    }

    const sellerProduct = sellers[0];
    const seller1 = sellerProduct.seller;
    const currentStock = sellerProduct.stock;
    
    // We intentionally request more than what the seller has in stock
    const quantityToOrder = currentStock + 10; 

    console.log('📋 TEST DATA:');
    console.log(`  Product: ${product1.name}`);
    console.log(`  Seller: ${seller1.businessName}`);
    console.log(`  Current Seller Stock: ${currentStock}`);
    console.log(`  Attempting to add: ${quantityToOrder}\n`);

    console.log('📋 STEP 1: Attempting to add excessive quantity via API...');
    
    const addResponse = await fetch(`${BASE_URL}/api/v1/cart/add`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productId: product1.id,
        quantity: quantityToOrder,
        sellerId: seller1.id,
      }),
    });
    
    const result = await addResponse.json();
    console.log(`   API Response Status: ${addResponse.status}`);
    console.log(`   API Response Message: ${result.message || result.error || JSON.stringify(result)}\n`);

    // Usually stock validation returns a 400 Bad Request
    if (!addResponse.ok) {
        console.log('✅ PASS: API correctly rejected cart addition due to insufficient stock.\n');
    } else {
        console.error('❌ FAIL: API allowed adding more items than the seller has in stock!\n');
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testCartValidation();
