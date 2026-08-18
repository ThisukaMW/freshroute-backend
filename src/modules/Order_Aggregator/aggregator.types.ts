export type DeliveryTimeSlot = "MORNING" | "AFTERNOON" | "EVENING";

export interface AggregationRunInput {
  windowStart: Date;
  windowEnd: Date;
  triggerMode?: "manual" | "payment_event" | "scheduled";
  clusterRadiusKm?: number;
  minPoints?: number;
  maxStopsPerBatch?: number;
  maxWeightPerBatch?: number;
  maxVolumePerBatch?: number;
  autoAssignRoutes?: boolean;
  autoAssignFleet?: boolean;
  autoAssignDriver?: boolean;
  dryRun?: boolean;
  runMode?: "overnight" | "catchup";
  targetDeliveryDay?: Date;
  targetDeliverySlot?: DeliveryTimeSlot;
  includeDeferredFromSlots?: DeliveryTimeSlot[];
}

export interface CandidateOrder {
  id: string;
  orderNumber: string;
  status: string;
  isCancelled: boolean;
  batchId: string | null;
  deliveryDate: Date | null;
  deliveryTimeSlot: DeliveryTimeSlot | null;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  storageType: "NORMAL" | "COLD";
  totalWeight: number | null;
  totalVolume: number | null;
  placedAt: Date;
  pickupHubId: string | null;
  deliveryZoneId: string | null;
  deliveryZoneCode: string | null;
  sellerLat: number | null;
  sellerLng: number | null;
  sellerIds: string[];
  deferredFromSlot: DeliveryTimeSlot | null;
  sellers: Array<{
    id: string;
    address: string;
    lat: number | null;
    lng: number | null;
  }>;
}

export interface RejectedOrderReason {
  orderId: string;
  orderNumber: string;
  reason: string;
}

export interface ClusteredOrderGroup {
  pickupHubId: string;
  storageType: "NORMAL" | "COLD";
  deliveryZoneCode: string;
  deliveryTimeSlot: DeliveryTimeSlot;
  clusterKey: string;
  orders: CandidateOrder[];
}

export interface PackedBatchSlice {
  pickupHubId: string;
  storageType: "NORMAL" | "COLD";
  deliveryZoneCode: string;
  deliveryTimeSlot: DeliveryTimeSlot;
  clusterKey: string;
  orders: CandidateOrder[];
  totalWeight: number;
  totalVolume: number;
}

export interface AggregationSummary {
  runId: string;
  dryRun: boolean;
  triggerMode: "manual" | "payment_event" | "scheduled";
  windowStart: string;
  windowEnd: string;
  config: {
    triggerMode: "manual" | "payment_event" | "scheduled";
    clusterRadiusKm: number;
    minPoints: number;
    maxStopsPerBatch: number;
    maxWeightPerBatch: number;
    maxVolumePerBatch: number;
    autoAssignRoutes: boolean;
    autoAssignFleet: boolean;
    autoAssignDriver: boolean;
    runMode: "overnight" | "catchup";
    targetDeliverySlot?: DeliveryTimeSlot;
  };
  totalCandidatesFetched: number;
  totalEligible: number;
  totalRejected: number;
  totalClusters: number;
  totalPackedSlices: number;
  totalBatchesCreated: number;
  totalOrdersBatched: number;
  totalRoutesAutoAssigned: number;
  batchesCreated: Array<{
    batchId: string;
    batchNumber: string;
    pickupHubId: string;
    storageType: "NORMAL" | "COLD";
    deliveryTimeSlot: DeliveryTimeSlot;
    clusterKey: string;
    orderIds: string[];
    orderNumbers: string[];
    totalWeight: number;
    totalVolume: number;
    truckId: string;
    fieldAdminId: string | null;
  }>;
  rejectedOrders: RejectedOrderReason[];
  deferredOrders: Array<{
    orderId: string;
    orderNumber: string;
    fromSlot: DeliveryTimeSlot;
    toSlot: DeliveryTimeSlot;
  }>;
  terminalRejections: Array<{
    orderId: string;
    orderNumber: string;
    reason: string;
  }>;
}
