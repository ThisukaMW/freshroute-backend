// src/modules/admin/admin.routes.ts
import { Router } from 'express';
import { loginAdmin } from './admin.controller.js';

const router = Router();

router.post('/login', loginAdmin);

export default router;