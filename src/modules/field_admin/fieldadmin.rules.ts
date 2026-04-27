export const normalizeApprovedQuantity = (approvedQuantity: number | undefined, totalQuantity: number) => {
  if (approvedQuantity === undefined) return totalQuantity;
  return Math.max(0, Math.min(approvedQuantity, totalQuantity));
};

export const inferInspectionResult = (approvedQuantity: number, totalQuantity: number) => {
  if (approvedQuantity <= 0) return "REJECTED" as const;
  if (approvedQuantity < totalQuantity) return "PARTIAL" as const;
  return "APPROVED" as const;
};

export const isValidRefundAmount = (amount: number, totalAmount: number) =>
  amount > 0 && amount <= totalAmount;

export const isOwnedByFieldAdmin = (resourceFieldAdminId: string | null | undefined, actorFieldAdminId: string) =>
  Boolean(resourceFieldAdminId) && resourceFieldAdminId === actorFieldAdminId;
