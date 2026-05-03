import express from "express";
import plannerService from "./planner.service.js";

export const planBatchHandler = async (req: express.Request, res: express.Response) => {
  const { batchId } = req.params;
  try {
    const result = await plannerService.planBatch(batchId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? String(err) });
  }
};

export default { planBatchHandler };
