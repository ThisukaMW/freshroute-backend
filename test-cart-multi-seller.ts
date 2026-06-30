import { PrismaClient } from './src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🔍 MULTI-SELLER CART DIAGNOSTIC TEST\n');

  try {
    // Step 1: Check database schema
    console.log('📋 Step 1: Checking CartItem table schema...');
    const cartItemConstraints = await prisma.$queryRaw`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name='CartItem' AND constraint_type='UNIQUE'
    `;
    console.log('✅ Constraints:', cartItemConstraints);

    // Step 2: Check current CartItems
    console.log('\n📋 Step 2: Checking existing CartItems...');
    const existingCartItems = await prisma.cartItem.findMany({
      select: {
        id: true,
        cartId: true,
        productId: true,
        sellerId: true,
        quantity: true,
      },
    });
    console.log(`✅ Found ${existingCartItems.length} CartItems:`, existingCartItems);

    // Step 3: Get or create test data
    console.log('\n📋 Step 3: Setting up test data...');
    
    // Get first seller
    const seller1 = await prisma.seller.findFirst();
    if (!seller1) {
      console.error('❌ No seller found. Cannot run test.');
      return;
    }
    console.log(`✅ Using Seller 1: ${seller1.id}`);

    // Get second seller
    let seller2 = await prisma.seller.findFirst({
      where: { id: { not: seller1.id } },
    });
    if (!seller2) {
      console.log('⚠️ Only one seller exists. Creating test seller...');
      seller2 = await prisma.seller.create({
        data: {
          userId: 'test-user-' + Date.now(),
          businessName: 'Test Seller 2',
          businessAddress: 'Test Address',
          latitude: 0,
          longitude: 0,
        },
      });
    }
    console.log(`✅ Using Seller 2: ${seller2.id}`);

    // Get first buyer
    const buyer = await prisma.buyer.findFirst();
    if (!buyer) {
      console.error('❌ No buyer found. Cannot run test.');
      return;
    }
    console.log(`✅ Using Buyer: ${buyer.id}`);

    // Get or create cart
    let cart = await prisma.cart.findUnique({
      where: { buyerId: buyer.id },
    });
    if (!cart) {
      cart = await prisma.cart.create({
        data: { buyerId: buyer.id },
      });
    }
    console.log(`✅ Using Cart: ${cart.id}`);

    // Get first product
    const product = await prisma.product.findFirst();
    if (!product) {
      console.error('❌ No product found. Cannot run test.');
      return;
    }
    console.log(`✅ Using Product: ${product.id}`);

    // Step 4: Test FIRST entry (Seller 1)
    console.log('\n📋 Step 4: Adding product from SELLER 1...');
    console.log(`Looking for existing CartItem with: cartId=${cart.id}, productId=${product.id}, sellerId=${seller1.id}`);
    
    const existing1 = await prisma.cartItem.findUnique({
      where: {
        cartId_productId_sellerId: {
          cartId: cart.id,
          productId: product.id,
          sellerId: seller1.id,
        },
      },
    });
    console.log(`Result: ${existing1 ? '✅ FOUND existing' : '⭕ NOT FOUND - will CREATE new'}`);

    let cartItem1;
    if (existing1) {
      cartItem1 = await prisma.cartItem.update({
        where: { id: existing1.id },
        data: { quantity: existing1.quantity + 2 },
      });
      console.log(`📝 Updated CartItem: ${cartItem1.id}, quantity now: ${cartItem1.quantity}`);
    } else {
      cartItem1 = await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          sellerId: seller1.id,
          quantity: 2,
        },
      });
      console.log(`➕ CREATED CartItem #1: ${cartItem1.id}`);
      console.log(`   - cartId: ${cartItem1.cartId}`);
      console.log(`   - productId: ${cartItem1.productId}`);
      console.log(`   - sellerId: ${cartItem1.sellerId}`);
      console.log(`   - quantity: ${cartItem1.quantity}`);
    }

    // Step 5: Test SECOND entry (Seller 2 - DIFFERENT)
    console.log('\n📋 Step 5: Adding SAME product from SELLER 2...');
    console.log(`Looking for existing CartItem with: cartId=${cart.id}, productId=${product.id}, sellerId=${seller2.id}`);
    
    const existing2 = await prisma.cartItem.findUnique({
      where: {
        cartId_productId_sellerId: {
          cartId: cart.id,
          productId: product.id,
          sellerId: seller2.id,
        },
      },
    });
    console.log(`Result: ${existing2 ? '✅ FOUND existing' : '⭕ NOT FOUND - will CREATE new'}`);

    let cartItem2;
    if (existing2) {
      cartItem2 = await prisma.cartItem.update({
        where: { id: existing2.id },
        data: { quantity: existing2.quantity + 1 },
      });
      console.log(`📝 Updated CartItem: ${cartItem2.id}, quantity now: ${cartItem2.quantity}`);
    } else {
      cartItem2 = await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          sellerId: seller2.id,
          quantity: 1,
        },
      });
      console.log(`➕ CREATED CartItem #2: ${cartItem2.id}`);
      console.log(`   - cartId: ${cartItem2.cartId}`);
      console.log(`   - productId: ${cartItem2.productId}`);
      console.log(`   - sellerId: ${cartItem2.sellerId} (DIFFERENT from #1!)`);
      console.log(`   - quantity: ${cartItem2.quantity}`);
    }

    // Step 6: Verify both exist
    console.log('\n📋 Step 6: Verifying both CartItems exist...');
    const allItems = await prisma.cartItem.findMany({
      where: { cartId: cart.id, productId: product.id },
      select: {
        id: true,
        cartId: true,
        productId: true,
        sellerId: true,
        quantity: true,
      },
    });
    console.log(`✅ Total CartItems for this product in cart: ${allItems.length}`);
    allItems.forEach((item, idx) => {
      console.log(`   #${idx + 1}: ${item.id} | seller: ${item.sellerId} | qty: ${item.quantity}`);
    });

    if (allItems.length === 2) {
      console.log('\n✅✅✅ SUCCESS! Two separate CartItem records created!');
    } else if (allItems.length === 1) {
      console.log('\n❌ FAILURE! Only 1 CartItem. Second seller\'s item was NOT created.');
      console.log('   Possible causes:');
      console.log('   1. Composite unique constraint not working in database');
      console.log('   2. sellerId is being treated as NULL');
      console.log('   3. Constraint violation error was silently caught');
    }
  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Full error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
