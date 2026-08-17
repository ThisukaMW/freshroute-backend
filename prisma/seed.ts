import net from "node:net";
import {
  PrismaClient,
  TruckStorageSupport,
} from "../src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import {
  getDeliveryDayBoundsColombo,
  getOrderPlacementDayBoundsColombo,
} from "../src/modules/Order_Aggregator/aggregator.colombo.js";

dotenv.config();

// See src/config/database.ts for why this is required on this network.
net.setDefaultAutoSelectFamily(false);

/** `placedAt` inside [placementDayStart, placementDayEnd] for aggregator intake day (Asia/Colombo). */
const placedAtOnPlacementDay = (
  placementDayStart: Date,
  placementDayEnd: Date,
  offsetHoursFromStart: number,
): Date => {
  const t = new Date(
    placementDayStart.getTime() + offsetHoursFromStart * 60 * 60 * 1000,
  );
  const endCap = placementDayEnd.getTime() - 60_000;
  if (t.getTime() > endCap) return new Date(endCap);
  return t;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: 1,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
});
const prisma = new PrismaClient({ adapter });

const seedMode = process.env.SEED_MODE?.trim().toLowerCase() ?? "default";

const clearDatabase = async () => {
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
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.sellerProduct.deleteMany();
  await prisma.stockHistory.deleteMany();
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
  await prisma.fieldAdmin.deleteMany();
  await prisma.user.deleteMany();
};

const seedSimulationScenario = async () => {
  console.log("🧪 Seeding deterministic simulation dataset...");
  await clearDatabase();

  const passwordHash = await bcrypt.hash("demo123", 10);
  const buyerHash = await bcrypt.hash("buyer123", 10);
  const adminHash = await bcrypt.hash("Admin@1234", 10);

  await prisma.user.create({
    data: {
      email: "admin@freshroute.com",
      name: "Platform Admin",
      role: "ADMIN",
      passwordHash: adminHash,
    },
  });

  const sellerConfigs = [
    {
      name: "North Valley Farms",
      email: "seller.north@freshroute.com",
      address: "12 North Valley Rd, Colombo",
      lat: 6.965,
      lng: 79.872,
    },
    {
      name: "Southern Greens Cooperative",
      email: "seller.south@freshroute.com",
      address: "88 Galle Road, Colombo",
      lat: 6.865,
      lng: 79.862,
    },
    {
      name: "Central Harvest Hub",
      email: "seller.central@freshroute.com",
      address: "22 Borella Junction, Colombo",
      lat: 6.915,
      lng: 79.878,
    },
  ];

  const sellers: Array<{ id: string; userId: string }> = [];
  for (const sellerCfg of sellerConfigs) {
    const user = await prisma.user.create({
      data: {
        email: sellerCfg.email,
        name: sellerCfg.name,
        role: "SELLER",
        passwordHash,
      },
    });
    const seller = await prisma.seller.create({
      data: {
        userId: user.id,
        businessName: sellerCfg.name,
        businessAddress: sellerCfg.address,
        latitude: sellerCfg.lat,
        longitude: sellerCfg.lng,
        isApproved: true,
      },
    });
    sellers.push({ id: seller.id, userId: user.id });
  }

  const fieldAdmins: string[] = [];
  for (let index = 1; index <= 3; index += 1) {
    const user = await prisma.user.create({
      data: {
        email: `fieldadmin${index}@freshroute.com`,
        name: `Field Admin ${index}`,
        role: "FIELD_ADMIN",
        passwordHash,
      },
    });
    const fieldAdmin = await prisma.fieldAdmin.create({
      data: {
        userId: user.id,
        vehicleNumber: `FA-${String(index).padStart(3, "0")}`,
        vehicleType: "Support Van",
        isActive: true,
      },
    });
    fieldAdmins.push(fieldAdmin.id);
  }

  for (let index = 1; index <= 10; index += 1) {
    const user = await prisma.user.create({
      data: {
        email: `driver${index}@freshroute.com`,
        name: `Driver ${index}`,
        role: "DRIVER",
        passwordHash,
      },
    });
    await prisma.driver.create({
      data: {
        userId: user.id,
        licenseNumber: `DL-SIM-${String(index).padStart(3, "0")}`,
        vehicleNumber: `DRV-SIM-${String(index).padStart(3, "0")}`,
        vehicleType: "Truck",
        vehicleCapacity: 450 + index * 30,
        isActive: true,
        isAvailable: true,
      },
    });
  }

  const hubs = await Promise.all([
    prisma.hub.create({
      data: {
        name: "North Collection Hub",
        latitude: 6.968,
        longitude: 79.868,
        type: "MARKET",
      },
    }),
    prisma.hub.create({
      data: {
        name: "South Collection Hub",
        latitude: 6.858,
        longitude: 79.864,
        type: "FARM",
      },
    }),
    prisma.hub.create({
      data: {
        name: "Central Aggregation Hub",
        latitude: 6.914,
        longitude: 79.872,
        type: "AGGREGATION_CENTER",
      },
    }),
  ]);

  const zones = await Promise.all([
    prisma.deliveryZone.create({
      data: {
        name: "Colombo North",
        code: "CMB_NORTH",
        minLat: 6.94,
        maxLat: 7.02,
        minLng: 79.83,
        maxLng: 79.91,
      },
    }),
    prisma.deliveryZone.create({
      data: {
        name: "Colombo Central",
        code: "CMB_CENTRAL",
        minLat: 6.9,
        maxLat: 6.9399,
        minLng: 79.84,
        maxLng: 79.91,
      },
    }),
    prisma.deliveryZone.create({
      data: {
        name: "Colombo South",
        code: "CMB_SOUTH",
        minLat: 6.84,
        maxLat: 6.8999,
        minLng: 79.84,
        maxLng: 79.91,
      },
    }),
  ]);

  const products = [];
  for (let index = 0; index < sellers.length; index += 1) {
    const seller = sellers[index]!;
    const product = await prisma.product.create({
      data: {
        sellerId: seller.id,
        name: `Demo Product ${index + 1}`,
        category: "Produce",
        price: 2.5 + index,
        unit: "kg",
        stock: 500,
        status: "APPROVED",
      },
    });
    products.push(product);
  }

  const buyers: Array<{
    id: string;
    lat: number;
    lng: number;
    zoneIndex: number;
  }> = [];
  for (let index = 1; index <= 75; index += 1) {
    const zoneIndex = (index - 1) % zones.length;
    const zone = zones[zoneIndex]!;
    const latRange = zone.maxLat - zone.minLat;
    const lngRange = zone.maxLng - zone.minLng;
    const lat = zone.minLat + ((index % 23) / 23) * latRange;
    const lng = zone.minLng + ((index % 19) / 19) * lngRange;

    const user = await prisma.user.create({
      data: {
        email: `sim-buyer-${String(index).padStart(3, "0")}@freshroute.com`,
        name: `Simulation Buyer ${index}`,
        role: "BUYER",
        passwordHash: buyerHash,
      },
    });
    const buyer = await prisma.buyer.create({
      data: {
        userId: user.id,
        deliveryAddress: `Simulation Address ${index}, Zone ${zone.code}`,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
      },
    });
    buyers.push({
      id: buyer.id,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      zoneIndex,
    });
  }

  // Aggregator uses "placement day" = previous Colombo calendar day vs. "today" (delivery day).
  const seedNow = new Date();
  const { deliveryDayStart } = getDeliveryDayBoundsColombo(seedNow);
  const { placementDayStart, placementDayEnd } =
    getOrderPlacementDayBoundsColombo(deliveryDayStart);

  let paidOrders = 0;

  for (let index = 1; index <= 68; index += 1) {
    const buyer = buyers[index - 1]!;
    const zone = zones[buyer.zoneIndex]!;
    const seller = sellers[(index - 1) % sellers.length]!;
    const product = products[(index - 1) % products.length]!;
    const storageType = index % 5 === 0 ? "COLD" : "NORMAL";
    const baseWeight = Number((10 + (index % 10) * 5.2).toFixed(2));
    const baseVolume = Number((1.6 + (index % 8) * 1.0).toFixed(2));
    const quantity = index % 10 === 0 ? 18 + (index % 5) * 2 : 2 + (index % 5);
    const assignedHub = hubs[(index - 1) % hubs.length]!;

    paidOrders += 1;

    const order = await prisma.order.create({
      data: {
        buyerId: buyer.id,
        orderNumber: `SIM-ORD-${String(index).padStart(3, "0")}`,
        status: "PAID",
        isCancelled: false,
        totalAmount: Number(
          (product.price * quantity * (1 + (index % 5) * 0.05)).toFixed(2),
        ),
        storageType,
        totalWeight: Number((baseWeight * quantity).toFixed(2)),
        totalVolume: Number((baseVolume * quantity).toFixed(2)),
        deliveryAddress: `Simulation Address ${index}, Zone ${zone.code}`,
        deliveryLat: buyer.lat,
        deliveryLng: buyer.lng,
        deliveryZoneId: zone.id,
        deliveryDate: new Date(
          deliveryDayStart.getTime() + (index % 6) * 30 * 60 * 1000,
        ),
        pickupHubId: assignedHub.id,
        placedAt: placedAtOnPlacementDay(
          placementDayStart,
          placementDayEnd,
          1 + (index % 14) * 0.75,
        ),
      },
    });

    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        quantity,
        unitPrice: product.price,
        totalPrice: Number((product.price * quantity).toFixed(2)),
        sellerId: seller.id,
      },
    });
  }

  console.log("✅ Simulation seed complete");
  console.log(`PAID unbatched orders (placement day Colombo): ${paidOrders}`);
  console.log(
    `Placement window (UTC): ${placementDayStart.toISOString()} … ${placementDayEnd.toISOString()}`,
  );
  console.log(`Delivery day start (UTC): ${deliveryDayStart.toISOString()}`);
  console.log(
    `Zones: ${zones.length}, Hubs: ${hubs.length}, FieldAdmins: ${fieldAdmins.length}`,
  );
};

async function main() {
  if (seedMode === "simulation") {
    await seedSimulationScenario();
    return;
  }

  console.log("🌱 Seeding FreshRoute database...");
  await clearDatabase();

  const seedNow = new Date();
  const { deliveryDayStart, deliveryDayEnd } =
    getDeliveryDayBoundsColombo(seedNow);
  const { placementDayStart, placementDayEnd } =
    getOrderPlacementDayBoundsColombo(deliveryDayStart);

  const passwordHash = await bcrypt.hash("driver123", 10);

  // ─── Platform Admin (for /auth/admin/login + aggregator manual override) ───
  const adminPasswordHash = await bcrypt.hash("Admin@1234", 10);
  await prisma.user.create({
    data: {
      email: "admin@freshroute.com",
      name: "Platform Admin",
      role: "ADMIN",
      passwordHash: adminPasswordHash,
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

  const fieldAdmin1PasswordHash = await bcrypt.hash("demo123", 10);
  const fieldAdminUser1 = await prisma.user.create({
    data: {
      email: "fieldadmin1@freshroute.com",
      name: "Field Admin 1",
      role: "FIELD_ADMIN",
      passwordHash: fieldAdmin1PasswordHash,
    },
  });

  await prisma.fieldAdmin.create({
    data: {
      userId: fieldAdminUser1.id,
      vehicleNumber: "FA-002",
      vehicleType: "Support Van",
    },
  });
  // Note: trucks removed from seed to keep manifest empty for UI testing.
  // If you want demo trucks again, re-add truck creation here.
  const demoDriverPassword = await bcrypt.hash("driver123", 10);
  for (let i = 1; i <= 12; i += 1) {
    const user = await prisma.user.create({
      data: {
        email: `agg-driver-${String(i).padStart(2, "0")}@freshroute.com`,
        name: `Aggregator Demo Driver ${i}`,
        role: "DRIVER",
        passwordHash: demoDriverPassword,
      },
    });
    await prisma.driver.create({
      data: {
        userId: user.id,
        licenseNumber: `DL-AGG-DEMO-${String(i).padStart(3, "0")}`,
        vehicleNumber: `VAN-DEMO-${String(i).padStart(2, "0")}`,
        vehicleType: "Van",
        vehicleCapacity: 500,
        isActive: true,
        isAvailable: true,
      },
    });
  }

  // ─── Demo trucks for manual aggregation override and auto-assignment ───
  await Promise.all(
    [
      {
        operator: "Sunshine Holdings",
        vehicleNumber: "TRUCK-001",
        vehicleType: "Van",
        storageSupport: TruckStorageSupport.BOTH,
      },
      {
        operator: "Green Valley Transport",
        vehicleNumber: "TRUCK-002",
        vehicleType: "Van",
        storageSupport: TruckStorageSupport.NORMAL,
      },
      {
        operator: "Summerwille Logistics",
        vehicleNumber: "TRUCK-003",
        vehicleType: "Van",
        storageSupport: TruckStorageSupport.NORMAL,
      },
      {
        operator: "Silver Creek Freight",
        vehicleNumber: "TRUCK-004",
        vehicleType: "Van",
        storageSupport: TruckStorageSupport.BOTH,
      },
    ].map((truck) =>
      prisma.truck.create({
        data: {
          ...truck,
          vehicleCapacity: 500,
          maxWeight: 600,
          maxVolume: 120,
          maxStops: 15,
          capacityLbs: 5400,
          loadedLbs: 0,
          palletsCap: 3,
          palletsLoaded: 0,
          cratesLoaded: 0,
          boxesLoaded: 0,
          temperature: "Ambient",
          loadBalanceLeft: 50,
          loadBalanceRight: 50,
          tiltRisk: "Low",
          isActive: true,
          isAvailable: true,
        },
      }),
    ),
  );

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
  /** Colombo hub — pickup for aggregator demo orders (same city as delivery zones). */
  const colomboHub = hubs[2]!;

  const deliveryZones = await Promise.all([
    prisma.deliveryZone.create({
      data: {
        name: "Colombo North",
        code: "CMB_NORTH",
        minLat: 6.92,
        maxLat: 6.99,
        minLng: 79.83,
        maxLng: 79.9,
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
        maxLng: 79.9,
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

  // ─── Additional sellers and seller product listings ─────────────────────────
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

  await prisma.sellerProduct.createMany({
    data: [
      {
        productId: products[0]!.id,
        sellerId: seller.id,
        price: products[0]!.price,
        stock: products[0]!.stock,
      },
      {
        productId: products[1]!.id,
        sellerId: seller.id,
        price: products[1]!.price,
        stock: products[1]!.stock,
      },
      {
        productId: products[2]!.id,
        sellerId: seller.id,
        price: products[2]!.price,
        stock: products[2]!.stock,
      },
      {
        productId: products[3]!.id,
        sellerId: seller.id,
        price: products[3]!.price,
        stock: products[3]!.stock,
      },
      {
        productId: products[0]!.id,
        sellerId: seller2.id,
        price: 3.2,
        stock: 75,
      },
      {
        productId: products[1]!.id,
        sellerId: seller2.id,
        price: 1.8,
        stock: 90,
      },
      {
        productId: products[3]!.id,
        sellerId: seller2.id,
        price: 3.8,
        stock: 40,
      },
      {
        productId: products[0]!.id,
        sellerId: seller3.id,
        price: 3.7,
        stock: 50,
      },
      {
        productId: products[2]!.id,
        sellerId: seller3.id,
        price: 1.4,
        stock: 30,
      },
      {
        productId: products[3]!.id,
        sellerId: seller3.id,
        price: 4.2,
        stock: 25,
      },
      {
        productId: products[0]!.id,
        sellerId: seller4.id,
        price: 4.0,
        stock: 60,
      },
      {
        productId: products[1]!.id,
        sellerId: seller4.id,
        price: 2.2,
        stock: 70,
      },
      {
        productId: products[2]!.id,
        sellerId: seller4.id,
        price: 1.6,
        stock: 55,
      },
      {
        productId: products[3]!.id,
        sellerId: seller4.id,
        price: 4.5,
        stock: 35,
      },
    ],
  });

  console.log("✅ SellerProduct listings created!");

  // ─── Buyers (12 for today's stops) ───────────────────────────────────────────
  const buyerData = [
    // 8 completed buyers
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
    // 4 pending buyers (matching screenshots)
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

  // ─── Batch (scheduled on current Colombo "delivery day") ─────────────────────
  const today = new Date(
    deliveryDayStart.getTime() + (6 * 60 + 45) * 60 * 1000,
  );
  const batchEnd = new Date(deliveryDayStart.getTime() + 14 * 60 * 60 * 1000);

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
      maxStopsApplied: 15,
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
      // truckId removed from seed (no trucks created)
      status: "IN_PROGRESS",
      totalDistance: 16.6,
      estimatedDuration: 87,
      scheduledStart: today,
      scheduledEnd: batchEnd,
      actualStart: today,
    },
  });

  // Seller pickup stops → hub consolidation (matches aggregator route shape)
  await prisma.stop.create({
    data: {
      routeId: route.id,
      type: "PICKUP",
      sequenceOrder: 1,
      sellerId: seller.id,
      address: "Farm Fresh Stall, Colombo",
      latitude: 6.91,
      longitude: 79.86,
      status: "COMPLETED",
      completedAt: today,
      itemsSummary: [{ sellerId: seller.id, note: "Farm Fresh seller pickup" }],
    },
  });

  await prisma.stop.create({
    data: {
      routeId: route.id,
      type: "PICKUP",
      sequenceOrder: 2,
      sellerId: seller2.id,
      address: "Green Valley Produce, Colombo",
      latitude: 6.935,
      longitude: 79.85,
      status: "COMPLETED",
      completedAt: today,
      itemsSummary: [{ sellerId: seller2.id, note: "Green Valley seller pickup" }],
    },
  });

  await prisma.stop.create({
    data: {
      routeId: route.id,
      type: "PICKUP",
      sequenceOrder: 3,
      address: primaryHub.name,
      latitude: primaryHub.latitude,
      longitude: primaryHub.longitude,
      status: "COMPLETED",
      completedAt: today,
      itemsSummary: [{ note: "Hub consolidation pickup" }],
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
        sequenceOrder: i + 4,
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
        deliveryZoneId:
          buyerInfo.lat >= 6.92 ? colomboNorthZone.id : colomboSouthZone.id,
        deliveryDate: today,
        pickupHubId: primaryHub.id,
        batchId: batch.id,
        stopId: stop.id,
        placedAt: placedAtOnPlacementDay(
          placementDayStart,
          placementDayEnd,
          2 + i * 1.25,
        ),
        actualDelivery: isCompleted
          ? new Date(now.getTime() - (8 - i) * 13 * 60000)
          : null,
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
  const firstStop = await prisma.stop.findFirst({
    where: { routeId: route.id },
  });
  if (firstStop) {
    await prisma.deliveryVerification.create({
      data: {
        fieldAdminId: fieldAdmin.id,
        stopId: firstStop.id,
        type: firstStop.type,
      },
    });

    // damage report for third stop if exists
    const stops = await prisma.stop.findMany({
      where: { routeId: route.id },
      take: 3,
      skip: 2,
    });
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
  // Unbatched; eligible rows use placement day (yesterday Colombo) so POST /aggregator/run finds them
  // when windowStart is default "today" midnight Colombo or any instant on the current delivery day.

  // ─── High-volume demo: many PAID orders → multiple geo/capacity slices → multiple batches/routes ───
  const bulkDemoBuyers: { id: string }[] = [];
  for (let i = 0; i < 42; i += 1) {
    const user = await prisma.user.create({
      data: {
        email: `bulk-demo-${String(i).padStart(3, "0")}@aggregator.local`,
        name: `Bulk Customer ${i + 1}`,
        role: "BUYER",
        passwordHash: buyerHashedPw,
      },
    });
    const buyer = await prisma.buyer.create({
      data: {
        userId: user.id,
        deliveryAddress: `${500 + i} Bulk St, Colombo`,
        latitude: 6.92,
        longitude: 79.855,
      },
    });
    bulkDemoBuyers.push(buyer);
  }
  let bulkBuyerCursor = 0;
  const nextBulkBuyerId = () => {
    const row = bulkDemoBuyers[bulkBuyerCursor];
    bulkBuyerCursor += 1;
    return row!.id;
  };

  // 12× Colombo North NORMAL — tight cluster; ~46 kg each → capacity splits (500 kg / batch default)
  for (let i = 0; i < 12; i += 1) {
    const qty = 22 + (i % 6);
    const weight = 46;
    const volume = 3.65;
    const p = products[i % 4]!;
    const order = await prisma.order.create({
      data: {
        buyerId: nextBulkBuyerId(),
        orderNumber: `ORD-BULK-N-${String(i + 1).padStart(2, "0")}`,
        status: "PAID",
        isCancelled: false,
        totalAmount: Number((p.price * qty).toFixed(2)),
        storageType: "NORMAL",
        totalWeight: weight,
        totalVolume: volume,
        deliveryAddress: `${200 + i} Havelock North, Colombo`,
        deliveryLat: 6.958 + (i % 4) * 0.0022,
        deliveryLng: 79.856 + (i % 3) * 0.0022,
        deliveryZoneId: colomboNorthZone.id,
        deliveryDate: new Date(
          deliveryDayStart.getTime() + (1 + (i % 8)) * 30 * 60 * 1000,
        ),
        pickupHubId: colomboHub.id,
        placedAt: placedAtOnPlacementDay(
          placementDayStart,
          placementDayEnd,
          4 + i * 0.11,
        ),
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: p.id,
        quantity: qty,
        unitPrice: p.price,
        totalPrice: Number((p.price * qty).toFixed(2)),
        sellerId: seller.id,
      },
    });
  }

  // 15× Colombo South NORMAL — dense with ORD-AGG-001; ~42 kg each → multiple packed slices
  for (let i = 0; i < 15; i += 1) {
    const qty = 18 + (i % 8);
    const weight = 42;
    const volume = 3.25;
    const p = products[(i + 1) % 4]!;
    const order = await prisma.order.create({
      data: {
        buyerId: nextBulkBuyerId(),
        orderNumber: `ORD-BULK-S-${String(i + 1).padStart(2, "0")}`,
        status: "PAID",
        isCancelled: false,
        totalAmount: Number((p.price * qty).toFixed(2)),
        storageType: "NORMAL",
        totalWeight: weight,
        totalVolume: volume,
        deliveryAddress: `${300 + i} Marine Drive South, Colombo`,
        deliveryLat: 6.904 + (i % 5) * 0.0018,
        deliveryLng: 79.846 + (i % 4) * 0.0018,
        deliveryZoneId: colomboSouthZone.id,
        deliveryDate: new Date(
          deliveryDayStart.getTime() + (2 + (i % 10)) * 25 * 60 * 1000,
        ),
        pickupHubId: colomboHub.id,
        placedAt: placedAtOnPlacementDay(
          placementDayStart,
          placementDayEnd,
          6 + i * 0.1,
        ),
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: p.id,
        quantity: qty,
        unitPrice: p.price,
        totalPrice: Number((p.price * qty).toFixed(2)),
        sellerId: seller.id,
      },
    });
  }

  // 9× Colombo South COLD — separate storage group; pairs with ORD-AGG-002 for multi-route cold runs
  for (let i = 0; i < 9; i += 1) {
    const qty = 16 + (i % 5);
    const weight = 36;
    const volume = 3.05;
    const p = products[(i + 2) % 4]!;
    const order = await prisma.order.create({
      data: {
        buyerId: nextBulkBuyerId(),
        orderNumber: `ORD-BULK-C-${String(i + 1).padStart(2, "0")}`,
        status: "PAID",
        isCancelled: false,
        totalAmount: Number((p.price * qty).toFixed(2)),
        storageType: "COLD",
        totalWeight: weight,
        totalVolume: volume,
        deliveryAddress: `${400 + i} Cold Chain Rd, Colombo`,
        deliveryLat: 6.888 + (i % 4) * 0.0024,
        deliveryLng: 79.868 + (i % 3) * 0.0024,
        deliveryZoneId: colomboSouthZone.id,
        deliveryDate: new Date(
          deliveryDayStart.getTime() + (3 + (i % 6)) * 28 * 60 * 1000,
        ),
        pickupHubId: colomboHub.id,
        placedAt: placedAtOnPlacementDay(
          placementDayStart,
          placementDayEnd,
          8 + i * 0.09,
        ),
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: p.id,
        quantity: qty,
        unitPrice: p.price,
        totalPrice: Number((p.price * qty).toFixed(2)),
        sellerId: seller.id,
      },
    });
  }

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
      deliveryDate: new Date(deliveryDayStart.getTime() + 2 * 60 * 60 * 1000),
      pickupHubId: colomboHub.id,
      placedAt: placedAtOnPlacementDay(placementDayStart, placementDayEnd, 3),
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
      deliveryDate: new Date(deliveryDayStart.getTime() + 3 * 60 * 60 * 1000),
      pickupHubId: colomboHub.id,
      placedAt: placedAtOnPlacementDay(placementDayStart, placementDayEnd, 5),
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
      deliveryDate: new Date(deliveryDayStart.getTime() + 4 * 60 * 60 * 1000),
      pickupHubId: colomboHub.id,
      placedAt: placedAtOnPlacementDay(placementDayStart, placementDayEnd, 7),
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
      deliveryDate: new Date(deliveryDayStart.getTime() + 4 * 60 * 60 * 1000),
      pickupHubId: colomboHub.id,
      placedAt: placedAtOnPlacementDay(placementDayStart, placementDayEnd, 8),
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
      deliveryDate: new Date(deliveryDayStart.getTime() + 5 * 60 * 60 * 1000),
      pickupHubId: colomboHub.id,
      placedAt: placedAtOnPlacementDay(placementDayStart, placementDayEnd, 9),
    },
  });

  console.log("✅ Seed complete!");
  console.log("─────────────────────────────────");
  console.log("Admin login (for aggregator manual override):");
  console.log("  Email:    admin@freshroute.com");
  console.log("  Password: Admin@1234");
  console.log("─────────────────────────────────");
  console.log("Field Admin login:");
  console.log("  Email:    fieldadmin@freshroute.com");
  console.log("  Password: driver123");
  console.log("  Email:    fieldadmin1@freshroute.com");
  console.log("  Password: demo123");
  console.log("─────────────────────────────────");
  console.log("Driver login:");
  console.log("  Email:    mike@freshroute.com");
  console.log("  Password: driver123");
  console.log("─────────────────────────────────");
  console.log("Aggregator demo (Asia/Colombo):");
  console.log(
    `  Placement day (order placedAt window, UTC): ${placementDayStart.toISOString()} … ${placementDayEnd.toISOString()}`,
  );
  console.log(
    `  Delivery day for batching (UTC): ${deliveryDayStart.toISOString()} … ${deliveryDayEnd.toISOString()}`,
  );
  console.log(
    "  POST /api/v1/aggregator/run with empty body uses today's Colombo window;",
  );
  console.log(
    "  candidates = PAID, batchId null, placedAt on placement day above.",
  );
  console.log(
    "  Bulk demo: ORD-BULK-N/S/C-* (+ ORD-AGG-001/002) → multiple batches/routes when autoAssignRoutes is true.",
  );
  console.log("─────────────────────────────────");
  console.log("Route:  RT-2024-0218-042");
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
