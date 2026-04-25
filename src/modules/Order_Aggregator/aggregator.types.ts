export interface AggregationRunInput {
  windowStart: Date;
  windowEnd: Date;
  clusterRadiusKm?: number;
  minPoints?: number;
  maxStopsPerBatch?: number;
  maxWeightPerBatch?: number;
  maxVolumePerBatch?: number;
  dryRun?: boolean;
}

export interface CandidateOrder {
  id: string;
  orderNumber: string;
  status: string;
  isCancelled: boolean;
  batchId: string | null;
  deliveryDate: Date | null;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  storageType: "NORMAL" | "COLD";
  totalWeight: number | null;
  totalVolume: number | null;
  placedAt: Date;
  pickupHubId: string | null;
  sellerLat: number | null;
  sellerLng: number | null;
}

export interface RejectedOrderReason {
  orderId: string;
  orderNumber: string;
  reason: string;
}

export interface ClusteredOrderGroup {
  pickupHubId: string;
  storageType: "NORMAL" | "COLD";
  clusterKey: string;
  orders: CandidateOrder[];
}

export interface PackedBatchSlice {
  pickupHubId: string;
  storageType: "NORMAL" | "COLD";
  clusterKey: string;
  orders: CandidateOrder[];
  totalWeight: number;
  totalVolume: number;
}

export interface AggregationSummary {
  dryRun: boolean;
  windowStart: string;
  windowEnd: string;
  config: {
    clusterRadiusKm: number;
    minPoints: number;
    maxStopsPerBatch: number;
    maxWeightPerBatch: number;
    maxVolumePerBatch: number;
  };
  totalCandidatesFetched: number;
  totalEligible: number;
  totalRejected: number;
  totalClusters: number;
  totalPackedSlices: number;
  batchesCreated: Array<{
    batchId: string;
    batchNumber: string;
    pickupHubId: string;
    storageType: "NORMAL" | "COLD";
    clusterKey: string;
    orderIds: string[];
    orderNumbers: string[];
    totalWeight: number;
    totalVolume: number;
  }>;
  rejectedOrders: RejectedOrderReason[];
}
