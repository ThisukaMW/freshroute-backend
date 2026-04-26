import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding FreshRoute database...");

  // Clean existing data
  await prisma.notification.deleteMany();
  await prisma.rating.deleteMany();
  await prisma.driverLocation.deleteMany();
  await prisma.driverSession.deleteMany();
  await prisma.routeModification.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.stop.deleteMany();
  await prisma.route.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.product.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.seller.deleteMany();
  await prisma.buyer.deleteMany();
  await prisma.user.deleteMany();

  const adminPasswordHash = await bcrypt.hash("Admin@1234", 10);
  const passwordHash = await bcrypt.hash("driver123", 10);

  await prisma.user.create({
    data: {
      name: "Super Admin",
      email: "admin@freshroute.com",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  // ─── Driver Mike ────────────────────────────────────────────────────────────
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

  // ─── Seller ──────────────────────────────────────────────────────────────────
  const sellerUser = await prisma.user.create({
    data: {
      email: "freshfarm@freshroute.com",
      name: "Fresh Farm Owner",
      role: "SELLER",
      passwordHash,
    },
  });

  const seller = await prisma.seller.create({
    data: {
      userId: sellerUser.id,
      businessName: "Fresh Farm Organics",
      businessAddress: "45 Farm Road, Colombo",
      latitude: 6.9271,
      longitude: 79.8612,
      isApproved: true,
    },
  });

  // ─── Products ────────────────────────────────────────────────────────────────
  const products = await Promise.all([
    prisma.product.create({
      data: {
        sellerId: seller.id,
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
        sellerId: seller.id,
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
        sellerId: seller.id,
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
        sellerId: seller.id,
        name: "Organic Apples",
        category: "Fruits",
        price: 4.0,
        unit: "kg",
        stock: 50,
        status: "APPROVED",
      },
    }),
  ]);

  // ─── Buyers (12 for today's stops) ───────────────────────────────────────────
  const buyerData = [
    // 8 completed buyers
    { name: "Sam Wilson", address: "12 Oak Ave, Colombo 3", lat: 6.914, lng: 79.852, amount: 30.0, items: 3 },
    { name: "Lisa Chen", address: "34 Palm St, Colombo 4", lat: 6.901, lng: 79.861, amount: 30.0, items: 2 },
    { name: "David Park", address: "67 River Rd, Colombo 5", lat: 6.889, lng: 79.875, amount: 30.0, items: 4 },
    { name: "Emma White", address: "89 Hill Lane, Colombo 6", lat: 6.876, lng: 79.888, amount: 30.0, items: 2 },
    { name: "Chris Lee", address: "23 Beach Rd, Colombo 3", lat: 6.921, lng: 79.845, amount: 30.0, items: 3 },
    { name: "Nadia Ali", address: "56 Temple St, Colombo 7", lat: 6.934, lng: 79.857, amount: 30.0, items: 2 },
    { name: "Tom Brown", address: "78 Garden Ave, Colombo 8", lat: 6.945, lng: 79.862, amount: 30.0, items: 4 },
    { name: "Sara Khan", address: "90 Market St, Colombo 2", lat: 6.956, lng: 79.848, amount: 30.0, items: 3 },
    // 4 pending buyers (matching screenshots)
    { name: "John Doe", address: "123 Main St, Downtown", lat: 6.9319, lng: 79.8478, amount: 18.97, items: 3 },
    { name: "Jane Smith", address: "45 Lake View, Colombo 3", lat: 6.9045, lng: 79.8636, amount: 12.98, items: 2 },
    { name: "Bob Johnson", address: "78 Hill Top, Colombo 5", lat: 6.8892, lng: 79.8821, amount: 24.96, items: 4 },
    { name: "Alice Brown", address: "12 Sunset Blvd, Colombo 7", lat: 6.9472, lng: 79.8702, amount: 22.5, items: 2 },
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

  // ─── Batch ───────────────────────────────────────────────────────────────────
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

  // ─── Route RT-2024-0218-042 ───────────────────────────────────────────────────
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

  // ─── Create orders + stops ────────────────────────────────────────────────────
  const now = new Date();

  for (let i = 0; i < buyers.length; i++) {
    const buyerInfo = buyerData[i]!;
    const buyer = buyers[i]!;
    const isCompleted = i < 8; // first 8 are completed
    const orderNumber = `ORD-2024-${String(i + 1).padStart(3, "0")}`;

    const estimatedArrival = new Date(now);
    estimatedArrival.setMinutes(now.getMinutes() + (i - 7) * 13 + 12); // spacing stops ~13 min apart

    // Create stop first (without orderId, update after order is linked)
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
        completedAt: isCompleted ? new Date(now.getTime() - (8 - i) * 13 * 60000) : null,
        notes: isCompleted ? null : i === 8 ? "Ring doorbell" : null,
      },
    });

    // Create order linked to this stop
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
        actualDelivery: isCompleted ? new Date(now.getTime() - (8 - i) * 13 * 60000) : null,
      },
    });

    // Create 1-4 order items
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
          sellerId: seller.id,
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
  console.log("─────────────────────────────────");
  console.log("Route:  RT-2024-0218-042 | TRK-042");
  console.log("Stops:  12 total (8 completed, 4 pending)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
