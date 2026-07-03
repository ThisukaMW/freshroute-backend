import { haversineDistanceKm } from "./aggregator.utils.js";

export type OrderItemForPickup = {
  id: string;
  orderId: string;
  orderNumber: string;
  quantity: number;
  sellerId: string;
  product: {
    id: string;
    name: string;
    unit: string;
    seller: {
      id: string;
      businessName: string;
      businessAddress: string;
      latitude: number | null;
      longitude: number | null;
      user: { name: string };
    };
  };
};

export type OrderForPickup = {
  id: string;
  orderNumber: string;
  buyerId: string;
  items: OrderItemForPickup[];
};

export type SellerPickupGroup = {
  sellerId: string;
  sellerName: string;
  address: string;
  latitude: number;
  longitude: number;
  itemsSummary: Array<{
    orderItemId: string;
    orderId: string;
    orderNumber: string;
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
  }>;
};

export const buildSellerPickupGroups = (orders: OrderForPickup[]): SellerPickupGroup[] => {
  const sellerMap = new Map<string, SellerPickupGroup>();

  for (const order of orders) {
    for (const item of order.items) {
      const seller = item.product.seller;
      const lat = seller.latitude ?? 0;
      const lng = seller.longitude ?? 0;
      const existing = sellerMap.get(seller.id) ?? {
        sellerId: seller.id,
        sellerName: seller.businessName || seller.user.name,
        address: seller.businessAddress || `${seller.user.name} pickup`,
        latitude: lat,
        longitude: lng,
        itemsSummary: [],
      };
      existing.itemsSummary.push({
        orderItemId: item.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        unit: item.product.unit,
      });
      sellerMap.set(seller.id, existing);
    }
  }

  return Array.from(sellerMap.values());
};

export const sequenceSellerPickups = (groups: SellerPickupGroup[]): SellerPickupGroup[] => {
  if (groups.length <= 1) return groups;

  const remaining = [...groups];
  const sequenced: SellerPickupGroup[] = [];
  let currentLat = remaining[0]!.latitude;
  let currentLng = remaining[0]!.longitude;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i += 1) {
      const group = remaining[i]!;
      const dist = haversineDistanceKm(currentLat, currentLng, group.latitude, group.longitude);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }
    const [next] = remaining.splice(nearestIdx, 1);
    if (!next) break;
    sequenced.push(next);
    currentLat = next.latitude;
    currentLng = next.longitude;
  }

  return sequenced;
};

export const countRouteStops = (sellerCount: number, deliveryCount: number) =>
  sellerCount + 1 + deliveryCount;
