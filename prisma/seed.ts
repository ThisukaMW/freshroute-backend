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
  await prisma.aggregationRunRejection.deleteMany();
  await prisma.aggregationRun.deleteMany();
  await prisma.driverLocation.deleteMany();
  await prisma.driverSession.deleteMany();
  await prisma.routeModification.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.stop.deleteMany();
  await prisma.route.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.truck.deleteMany();
  await prisma.deliveryZone.deleteMany();
  await prisma.hub.deleteMany();
  await prisma.product.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.seller.deleteMany();
  await prisma.buyer.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("driver123", 10);

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

  // ─── FieldAdmin ─────────────────────────────────────

  const fieldAdminUser = await prisma.user.create({
    data: {
      email: "fieldadmin@freshroute.com",
      name: "Field Admin",
      role: "FIELD_ADMIN",
      passwordHash,
    },
  });

  const fieldAdmin = await prisma.fieldAdmin.create({
    data: {
      userId: fieldAdminUser.id,
      vehicleNumber: "FA-001",
      vehicleType: "Truck",
    },
  });

  const truckA = await prisma.truck.create({
    data: {
      vehicleNumber: "TRK-042",
      vehicleType: "Reefer",
      vehicleCapacity: 500,
      maxWeight: 500,
      maxVolume: 120,
      maxStops: 25,
      storageSupport: "BOTH",
      vehicleBrand: "Isuzu",
      makeYear: new Date("2020-01-01T00:00:00.000Z"),
      vehicleHeight: 3.5,
      VehicleWeight: 3200,
      Refregeration: true,
      Tempreture: 4,
      isActive: true,
      isAvailable: true,
    },
  });

  await prisma.truck.create({
    data: {
      vehicleNumber: "TRK-051",
      vehicleType: "Dry Van",
      vehicleCapacity: 350,
      maxWeight: 350,
      maxVolume: 85,
      maxStops: 18,
      storageSupport: "NORMAL",
      vehicleBrand: "Mitsubishi",
      makeYear: new Date("2021-01-01T00:00:00.000Z"),
      vehicleHeight: 3.2,
      VehicleWeight: 2800,
      Refregeration: false,
      Tempreture: 18,
      isActive: true,
      isAvailable: true,
    },
  });

  // ─── Fixed Pickup Hubs (Phase 1 Aggregator) ───────────────────────────────
  const hubs = await Promise.all([
    prisma.hub.create({
      data: {
        name: "Dambulla Market Hub",
        latitude: 7.8567,
        longitude: 80.6517,
        type: "MARKET",
      },
    }),
    prisma.hub.create({
      data: {
        name: "Central Province Farm Hub",
        latitude: 7.2906,
        longitude: 80.6337,
        type: "FARM",
      },
    }),
    prisma.hub.create({
      data: {
        name: "Colombo Regional Aggregation Center",
        latitude: 6.9271,
        longitude: 79.8612,
        type: "AGGREGATION_CENTER",
      },
    }),
  ]);

  const primaryHub = hubs[0]!;

  const deliveryZones = await Promise.all([
    prisma.deliveryZone.create({
      data: {
        name: "Colombo North",
        code: "CMB_NORTH",
        minLat: 6.92,
        maxLat: 6.99,
        minLng: 79.83,
        maxLng: 79.90,
        isActive: true,
      },
    }),
    prisma.deliveryZone.create({
      data: {
        name: "Colombo South",
        code: "CMB_SOUTH",
        minLat: 6.84,
        maxLat: 6.9199,
        minLng: 79.83,
        maxLng: 79.90,
        isActive: true,
      },
    }),
  ]);

  const colomboNorthZone = deliveryZones[0]!;
  const colomboSouthZone = deliveryZones[1]!;

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
      storageType: "NORMAL",
      dropClusterKey: "seed-colombo-cluster-1",
      pickupHubId: primaryHub.id,
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
      fieldAdminId: fieldAdmin.id,
      truckId: truckA.id,
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

  let firstOrder: any = null;
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
        isCancelled: false,
        totalAmount: buyerInfo.amount,
        storageType: "NORMAL",
        totalWeight: 8 + i,
        totalVolume: 1.5 + i * 0.1,
        deliveryAddress: buyerInfo.address,
        deliveryLat: buyerInfo.lat,
        deliveryLng: buyerInfo.lng,
        deliveryZoneId: buyerInfo.lat >= 6.92 ? colomboNorthZone.id : colomboSouthZone.id,
        deliveryDate: today,
        pickupHubId: primaryHub.id,
        batchId: batch.id,
        stopId: stop.id,
        placedAt: new Date(today.getTime() - (12 - i) * 24 * 60 * 60000),
        actualDelivery: isCompleted ? new Date(now.getTime() - (8 - i) * 13 * 60000) : null,
      },
    });

    if (i === 0) {
      firstOrder = order;
    }

    // Create 1-4 order items
    const itemCount = buyerInfo.items;
    for (let j = 0; j < itemCount; j++) {
      const product = products[j % products.length]!;
      const orderItem = await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          quantity: 1,
          unitPrice: product.price,
          totalPrice: product.price,
          sellerId: seller.id,
        },
      });

      // create a product inspection for the first item of first order
      if (i === 0 && j === 0) {
        await prisma.productInspection.create({
          data: {
            fieldAdminId: fieldAdmin.id,
            orderItemId: orderItem.id,
            result: "APPROVED",
            notes: "Looks good",
          },
        });
      }
    }
  }

  // ─── additional field-admin tasks sample ─────────────────────────────────
  // verification of first stop
  const firstStop = await prisma.stop.findFirst({ where: { routeId: route.id } });
  if (firstStop) {
    await prisma.deliveryVerification.create({
      data: {
        fieldAdminId: fieldAdmin.id,
        stopId: firstStop.id,
        type: firstStop.type,
      },
    });

    // damage report for third stop if exists
    const stops = await prisma.stop.findMany({ where: { routeId: route.id }, take: 3, skip: 2 });
    if (stops.length > 0) {
      await prisma.damageReport.create({
        data: {
          fieldAdminId: fieldAdmin.id,
          stopId: stops[0].id,
          description: "Box torn on arrival",
        },
      });
    }
  }

  // create an assessment for driver and seller
  await prisma.assessment.create({
    data: {
      fieldAdminId: fieldAdmin.id,
      targetUserId: mikeUser.id,
      target: "DRIVER",
      rating: 5,
      comment: "Excellent adherence to route",
    },
  });
  await prisma.assessment.create({
    data: {
      fieldAdminId: fieldAdmin.id,
      targetUserId: sellerUser.id,
      target: "SELLER",
      rating: 4,
      comment: "Products high quality",
    },
  });

  // refund example for first order (simulate cancellation)
  if (firstOrder) {
    await prisma.refund.create({
      data: {
        orderId: firstOrder.id,
        initiatedBy: fieldAdmin.id,
        amount: firstOrder.totalAmount,
        reason: "Customer cancelled",
        status: "PROCESSING",
      },
    });
  }

  // route modification approved by field admin
  await prisma.routeModification.create({
    data: {
      routeId: route.id,
      type: "STOP_ADDED",
      reason: "Extra delivery requested",
      approvedBy: fieldAdmin.id,
      oldData: {},
      newData: {},
    },
  });

  // ─── Aggregator test orders (eligible + ineligible cases) ─────────────────
  // These orders are intentionally left unbatched for manual aggregator testing.
  const aggregatorBaseDate = new Date();
  aggregatorBaseDate.setHours(9, 0, 0, 0);

  // Eligible
  const eligibleOrder1 = await prisma.order.create({
    data: {
      buyerId: buyers[0]!.id,
      orderNumber: "ORD-AGG-001",
      status: "PAID",
      isCancelled: false,
      totalAmount: 125.5,
      storageType: "NORMAL",
      totalWeight: 42,
      totalVolume: 5.8,
      deliveryAddress: "15 Union Place, Colombo 02",
      deliveryLat: 6.9185,
      deliveryLng: 79.8581,
      deliveryZoneId: colomboSouthZone.id,
      deliveryDate: aggregatorBaseDate,
      pickupHubId: primaryHub.id,
      placedAt: new Date(aggregatorBaseDate.getTime() - 2 * 60 * 60 * 1000),
    },
  });

  await prisma.orderItem.create({
    data: {
      orderId: eligibleOrder1.id,
      productId: products[0]!.id,
      quantity: 6,
      unitPrice: products[0]!.price,
      totalPrice: products[0]!.price * 6,
      sellerId: seller.id,
    },
  });

  const eligibleOrder2 = await prisma.order.create({
    data: {
      buyerId: buyers[1]!.id,
      orderNumber: "ORD-AGG-002",
      status: "PAID",
      isCancelled: false,
      totalAmount: 90,
      storageType: "COLD",
      totalWeight: 28,
      totalVolume: 3.1,
      deliveryAddress: "22 Marine Drive, Colombo 03",
      deliveryLat: 6.9004,
      deliveryLng: 79.8492,
      deliveryZoneId: colomboSouthZone.id,
      deliveryDate: new Date(aggregatorBaseDate.getTime() + 30 * 60 * 1000),
      pickupHubId: primaryHub.id,
      placedAt: new Date(aggregatorBaseDate.getTime() - 90 * 60 * 1000),
    },
  });

  await prisma.orderItem.create({
    data: {
      orderId: eligibleOrder2.id,
      productId: products[1]!.id,
      quantity: 4,
      unitPrice: products[1]!.price,
      totalPrice: products[1]!.price * 4,
      sellerId: seller.id,
    },
  });

  // Ineligible: unpaid
  await prisma.order.create({
    data: {
      buyerId: buyers[2]!.id,
      orderNumber: "ORD-AGG-003",
      status: "PENDING",
      isCancelled: false,
      totalAmount: 48.5,
      storageType: "NORMAL",
      totalWeight: 12,
      totalVolume: 1.2,
      deliveryAddress: "18 Station Road, Colombo 04",
      deliveryLat: 6.8942,
      deliveryLng: 79.8607,
      deliveryZoneId: colomboSouthZone.id,
      deliveryDate: aggregatorBaseDate,
      pickupHubId: primaryHub.id,
    },
  });

  // Ineligible: cancelled
  await prisma.order.create({
    data: {
      buyerId: buyers[3]!.id,
      orderNumber: "ORD-AGG-004",
      status: "PAID",
      isCancelled: true,
      totalAmount: 62.75,
      storageType: "NORMAL",
      totalWeight: 15,
      totalVolume: 1.8,
      deliveryAddress: "44 Duplication Road, Colombo 03",
      deliveryLat: 6.9068,
      deliveryLng: 79.857,
      deliveryZoneId: colomboSouthZone.id,
      deliveryDate: aggregatorBaseDate,
      pickupHubId: primaryHub.id,
    },
  });

  // Ineligible: missing capacity metrics
  await prisma.order.create({
    data: {
      buyerId: buyers[4]!.id,
      orderNumber: "ORD-AGG-005",
      status: "PAID",
      isCancelled: false,
      totalAmount: 77.2,
      storageType: "NORMAL",
      deliveryAddress: "9 Lake Crescent, Colombo 07",
      deliveryLat: 6.9148,
      deliveryLng: 79.8715,
      deliveryZoneId: colomboSouthZone.id,
      deliveryDate: aggregatorBaseDate,
      pickupHubId: primaryHub.id,
    },
  });

  console.log("✅ Seed complete!");
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
