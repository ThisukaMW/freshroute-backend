import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
}) as any;

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding FreshRoute database...");

  // Clean existing data
  await prisma.sellerProduct.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.rating.deleteMany();
  await prisma.driverLocation.deleteMany();
  await prisma.driverSession.deleteMany();
  await prisma.routeModification.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.stop.deleteMany();
  await prisma.route.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.stockHistory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.seller.deleteMany();
  await prisma.buyer.deleteMany();
  await prisma.user.deleteMany();

  const adminPasswordHash = await bcrypt.hash("Admin@1234", 10);
  const passwordHash = await bcrypt.hash("driver123", 10);

  // ✅ Admin created AFTER deleteMany
  await prisma.user.create({
    data: {
      name: "Admin",
      email: "admin@freshroute.com",
      role: "ADMIN",
      status: "ACTIVE",
      passwordHash: adminPasswordHash,
    },
  });
  console.log("✅ Admin created");

  // ─── Driver Mike ─────────────────────────────────────────────────────────────
  const mikeUser = await prisma.user.create({
    data: {
      email: "mike@freshroute.com",
      name: "Driver Mike",
      role: "DRIVER",
      passwordHash,
      phone: "+94771234567",
    },
  });

  const mike = await prisma.driver.create({
    data: {
      userId: mikeUser.id,
      licenseNumber: "DL-TRK-042",
      vehicleNumber: "TRK-042",
      vehicleType: "Van",
      vehicleCapacity: 500,
      isActive: true,
      isAvailable: false,
      averageRating: 4.8,
      totalRatings: 120,
    },
  });

  // ─── Seller 1 (Fresh Farm) ────────────────────────────────────────────────────
  const sellerUser1 = await prisma.user.create({
    data: {
      email: "freshfarm@freshroute.com",
      name: "Fresh Farm Owner",
      role: "SELLER",
      passwordHash,
    },
  });

  const seller1 = await prisma.seller.create({
    data: {
      userId: sellerUser1.id,
      businessName: "Fresh Farm Organics",
      businessAddress: "45 Farm Road, Colombo",
      latitude: 6.9271,
      longitude: 79.8612,
      isApproved: true,
    },
  });

  // ─── Seller 2 (Green Valley) ──────────────────────────────────────────────────
  const sellerUser2 = await prisma.user.create({
    data: {
      email: "greenvalley@freshroute.com",
      name: "Green Valley Owner",
      role: "SELLER",
      passwordHash,
    },
  });

  const seller2 = await prisma.seller.create({
    data: {
      userId: sellerUser2.id,
      businessName: "Green Valley Produce",
      businessAddress: "12 Valley Street, Colombo",
      latitude: 6.935,
      longitude: 79.85,
      isApproved: true,
    },
  });

  // ─── Seller 3 (City Fresh) ────────────────────────────────────────────────────
  const sellerUser3 = await prisma.user.create({
    data: {
      email: "cityfresh@freshroute.com",
      name: "City Fresh Owner",
      role: "SELLER",
      passwordHash,
    },
  });

  const seller3 = await prisma.seller.create({
    data: {
      userId: sellerUser3.id,
      businessName: "City Fresh Market",
      businessAddress: "78 Market Lane, Colombo",
      latitude: 6.915,
      longitude: 79.87,
      isApproved: true,
    },
  });

  // ─── Seller 4 (Premium Harvest) ──────────────────────────────────────────────
  const sellerUser4 = await prisma.user.create({
    data: {
      email: "premiumharvest@freshroute.com",
      name: "Premium Harvest Owner",
      role: "SELLER",
      passwordHash,
    },
  });

  const seller4 = await prisma.seller.create({
    data: {
      userId: sellerUser4.id,
      businessName: "Premium Harvest Ltd",
      businessAddress: "99 Premium Plaza, Colombo",
      latitude: 6.92,
      longitude: 79.86,
      isApproved: true,
    },
  });

  // ─── Products (owned by seller1) ─────────────────────────────────────────────
  const products = await Promise.all([
    prisma.product.create({
      data: {
        sellerId: seller1.id,
        name: "Organic Tomatoes",
        category: "Vegetables",
        price: 3.5,
        unit: "kg",
        stock: 100,
        status: "APPROVED",
      },
    }),
    prisma.product.create({
      data: {
        sellerId: seller1.id,
        name: "Fresh Carrots",
        category: "Vegetables",
        price: 2.0,
        unit: "kg",
        stock: 80,
        status: "APPROVED",
      },
    }),
    prisma.product.create({
      data: {
        sellerId: seller1.id,
        name: "Green Lettuce",
        category: "Vegetables",
        price: 1.5,
        unit: "piece",
        stock: 60,
        status: "APPROVED",
      },
    }),
    prisma.product.create({
      data: {
        sellerId: seller1.id,
        name: "Organic Apples",
        category: "Fruits",
        price: 4.0,
        unit: "kg",
        stock: 50,
        status: "APPROVED",
      },
    }),
  ]);

  // ─── SellerProduct listings ───────────────────────────────────────────────────
  await Promise.all(
    products.map((product) =>
      prisma.sellerProduct.create({
        data: {
          productId: product.id,
          sellerId: seller1.id,
          price: product.price,
          stock: product.stock,
        },
      }),
    ),
  );

  await prisma.sellerProduct.create({
    data: {
      productId: products[0]!.id,
      sellerId: seller2.id,
      price: 3.2,
      stock: 75,
    },
  });
  await prisma.sellerProduct.create({
    data: {
      productId: products[1]!.id,
      sellerId: seller2.id,
      price: 1.8,
      stock: 90,
    },
  });
  await prisma.sellerProduct.create({
    data: {
      productId: products[3]!.id,
      sellerId: seller2.id,
      price: 3.8,
      stock: 40,
    },
  });

  await prisma.sellerProduct.create({
    data: {
      productId: products[0]!.id,
      sellerId: seller3.id,
      price: 3.7,
      stock: 50,
    },
  });
  await prisma.sellerProduct.create({
    data: {
      productId: products[2]!.id,
      sellerId: seller3.id,
      price: 1.4,
      stock: 30,
    },
  });
  await prisma.sellerProduct.create({
    data: {
      productId: products[3]!.id,
      sellerId: seller3.id,
      price: 4.2,
      stock: 25,
    },
  });

  await prisma.sellerProduct.create({
    data: {
      productId: products[0]!.id,
      sellerId: seller4.id,
      price: 4.0,
      stock: 60,
    },
  });
  await prisma.sellerProduct.create({
    data: {
      productId: products[1]!.id,
      sellerId: seller4.id,
      price: 2.2,
      stock: 70,
    },
  });
  await prisma.sellerProduct.create({
    data: {
      productId: products[2]!.id,
      sellerId: seller4.id,
      price: 1.6,
      stock: 55,
    },
  });
  await prisma.sellerProduct.create({
    data: {
      productId: products[3]!.id,
      sellerId: seller4.id,
      price: 4.5,
      stock: 35,
    },
  });

  console.log("✅ SellerProduct listings created!");

  // ─── Buyers ───────────────────────────────────────────────────────────────────
  const buyerData = [
    {
      name: "Sam Wilson",
      address: "12 Oak Ave, Colombo 3",
      lat: 6.914,
      lng: 79.852,
      amount: 30.0,
      items: 3,
    },
    {
      name: "Lisa Chen",
      address: "34 Palm St, Colombo 4",
      lat: 6.901,
      lng: 79.861,
      amount: 30.0,
      items: 2,
    },
    {
      name: "David Park",
      address: "67 River Rd, Colombo 5",
      lat: 6.889,
      lng: 79.875,
      amount: 30.0,
      items: 4,
    },
    {
      name: "Emma White",
      address: "89 Hill Lane, Colombo 6",
      lat: 6.876,
      lng: 79.888,
      amount: 30.0,
      items: 2,
    },
    {
      name: "Chris Lee",
      address: "23 Beach Rd, Colombo 3",
      lat: 6.921,
      lng: 79.845,
      amount: 30.0,
      items: 3,
    },
    {
      name: "Nadia Ali",
      address: "56 Temple St, Colombo 7",
      lat: 6.934,
      lng: 79.857,
      amount: 30.0,
      items: 2,
    },
    {
      name: "Tom Brown",
      address: "78 Garden Ave, Colombo 8",
      lat: 6.945,
      lng: 79.862,
      amount: 30.0,
      items: 4,
    },
    {
      name: "Sara Khan",
      address: "90 Market St, Colombo 2",
      lat: 6.956,
      lng: 79.848,
      amount: 30.0,
      items: 3,
    },
    {
      name: "John Doe",
      address: "123 Main St, Downtown",
      lat: 6.9319,
      lng: 79.8478,
      amount: 18.97,
      items: 3,
    },
    {
      name: "Jane Smith",
      address: "45 Lake View, Colombo 3",
      lat: 6.9045,
      lng: 79.8636,
      amount: 12.98,
      items: 2,
    },
    {
      name: "Bob Johnson",
      address: "78 Hill Top, Colombo 5",
      lat: 6.8892,
      lng: 79.8821,
      amount: 24.96,
      items: 4,
    },
    {
      name: "Alice Brown",
      address: "12 Sunset Blvd, Colombo 7",
      lat: 6.9472,
      lng: 79.8702,
      amount: 22.5,
      items: 2,
    },
  ];

  const buyers: Array<{ id: string; userId: string }> = [];
  const buyerHashedPw = await bcrypt.hash("buyer123", 10);

  for (const b of buyerData) {
    const user = await prisma.user.create({
      data: {
        email: `${b.name.toLowerCase().replace(/ /g, ".")}@example.com`,
        name: b.name,
        role: "BUYER",
        passwordHash: buyerHashedPw,
      },
    });
    const buyer = await prisma.buyer.create({
      data: {
        userId: user.id,
        deliveryAddress: b.address,
        latitude: b.lat,
        longitude: b.lng,
      },
    });
    buyers.push(buyer);
  }

  // ─── Batch ────────────────────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(6, 45, 0, 0);
  const batchEnd = new Date(today);
  batchEnd.setHours(14, 0, 0, 0);

  const batch = await prisma.batch.create({
    data: {
      batchNumber: "BATCH-2024-0218-001",
      status: "IN_PROGRESS",
      trigger: "SCHEDULED",
      scheduledDate: today,
      timeWindowStart: today,
      timeWindowEnd: batchEnd,
      orderCount: 12,
      closedAt: today,
    },
  });

  // ─── Route ────────────────────────────────────────────────────────────────────
  const route = await prisma.route.create({
    data: {
      routeNumber: "RT-2024-0218-042",
      batchId: batch.id,
      driverId: mike.id,
      status: "IN_PROGRESS",
      totalDistance: 16.6,
      estimatedDuration: 87,
      scheduledStart: today,
      scheduledEnd: batchEnd,
      actualStart: today,
    },
  });

  // ─── Orders + Stops ───────────────────────────────────────────────────────────
  const now = new Date();

  for (let i = 0; i < buyers.length; i++) {
    const buyerInfo = buyerData[i]!;
    const buyer = buyers[i]!;
    const isCompleted = i < 8;
    const orderNumber = `ORD-2024-${String(i + 1).padStart(3, "0")}`;

    const estimatedArrival = new Date(now);
    estimatedArrival.setMinutes(now.getMinutes() + (i - 7) * 13 + 12);

    const stop = await prisma.stop.create({
      data: {
        routeId: route.id,
        type: "DELIVERY",
        sequenceOrder: i + 1,
        address: buyerInfo.address,
        latitude: buyerInfo.lat,
        longitude: buyerInfo.lng,
        buyerId: buyer.id,
        status: isCompleted ? "COMPLETED" : i === 8 ? "IN_PROGRESS" : "PENDING",
        estimatedArrival,
        completedAt: isCompleted
          ? new Date(now.getTime() - (8 - i) * 13 * 60000)
          : null,
        notes: isCompleted ? null : i === 8 ? "Ring doorbell" : null,
      },
    });

    const order = await prisma.order.create({
      data: {
        buyerId: buyer.id,
        orderNumber,
        status: isCompleted ? "DELIVERED" : i === 8 ? "IN_TRANSIT" : "ASSIGNED",
        totalAmount: buyerInfo.amount,
        deliveryAddress: buyerInfo.address,
        deliveryLat: buyerInfo.lat,
        deliveryLng: buyerInfo.lng,
        batchId: batch.id,
        stopId: stop.id,
        placedAt: new Date(today.getTime() - (12 - i) * 24 * 60 * 60000),
        actualDelivery: isCompleted
          ? new Date(now.getTime() - (8 - i) * 13 * 60000)
          : null,
      },
    });

    const itemCount = buyerInfo.items;
    for (let j = 0; j < itemCount; j++) {
      const product = products[j % products.length]!;
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          quantity: 1,
          unitPrice: product.price,
          totalPrice: product.price,
          sellerId: seller1.id,
        },
      });
    }
  }

  console.log("✅ Seed complete!");
  console.log("─────────────────────────────────");
  console.log("Admin login:");
  console.log("  Email:    admin@freshroute.com");
  console.log("  Password: Admin@1234");
  console.log("─────────────────────────────────");
  console.log("Driver login:");
  console.log("  Email:    mike@freshroute.com");
  console.log("  Password: driver123");
  console.log("─────────────────────────────────────────────────");
  console.log("Driver:   mike@freshroute.com          / driver123");
  console.log("Seller 1: freshfarm@freshroute.com     / driver123");
  console.log("Seller 2: greenvalley@freshroute.com   / driver123");
  console.log("Seller 3: cityfresh@freshroute.com     / driver123");
  console.log("Seller 4: premiumharvest@freshroute.com / driver123");
  console.log("─────────────────────────────────────────────────");
  console.log("Products: 4 | SellerProduct listings: 14");
  console.log("Route: RT-2024-0218-042 | Stops: 12");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
