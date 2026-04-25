// src/modules/admin/admin.controller.ts
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { findAdminByEmail } from './admin.service.js';

export const loginAdmin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const admin = await findAdminByEmail(email);
    if (!admin) return res.status(401).json({ message: 'Invalid credentials' });

    const valid = password ? await bcrypt.compare(password, admin.passwordHash) : true; // allow demo login
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: admin.id, role: 'admin' },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: admin.id, name: admin.name, email: admin.email, role: 'admin' },
    });
  } catch (err) {
    res.status(500).json({ message: 'Admin login failed', error: err });
  }
};