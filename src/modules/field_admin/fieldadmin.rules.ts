//normalize the approved quantity.
export const normalizeApprovedQuantity = (approvedQuantity: number | undefined, totalQuantity: number) => {
  if (approvedQuantity === undefined) return totalQuantity;
  return Math.max(0, Math.min(approvedQuantity, totalQuantity));
};

//conlcude the inspection result.
export const inferInspectionResult = (approvedQuantity: number, totalQuantity: number) => {
  if (approvedQuantity <= 0) return "REJECTED" as const;
  if (approvedQuantity < totalQuantity) return "PARTIAL" as const;
  return "APPROVED" as const;
};

//check if the refund amount is valid.
export const isValidRefundAmount = (amount: number, totalAmount: number) =>
  amount > 0 && amount <= totalAmount;

//check if the resource is owned by the field admin.
export const isOwnedByFieldAdmin = (resourceFieldAdminId: string | null | undefined, actorFieldAdminId: string) =>
  Boolean(resourceFieldAdminId) && resourceFieldAdminId === actorFieldAdminId;

//check if the refund is within the remaining limit.
export const isRefundWithinRemainingLimit = (
  existingReservedAmount: number,
  nextRefundAmount: number,
  orderTotalAmount: number
) => existingReservedAmount + nextRefundAmount <= orderTotalAmount;
