import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import express from 'express';
import { createUserRouter } from '../../src/modules/user/user.route.js';

describe('User Routes Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  }); 

  describe('GET /api/users', () => {
    test('should return all users', async () => {
      const mockUsers = [
        { id: '1', name: 'User1', role: 'BUYER', status: 'ACTIVE' },
        { id: '2', name: 'User2', role: 'SELLER', status: 'ACTIVE' },
      ];

      const mockRouter = createUserRouter({
        getAllUsers: async () => mockUsers,
      });

      app.use('/api/users', mockRouter);
      const response = await request(app).get('/api/users');

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(response.body, mockUsers);
    });

    test('should handle errors in getAllUsers', async () => {
      const mockRouter = createUserRouter({
        getAllUsers: async () => {
          throw new Error('Database error');
        },
      });

      app.use('/api/users', mockRouter);
      const response = await request(app).get('/api/users');

      assert.strictEqual(response.status, 500);
      assert.strictEqual(response.body.message, 'Database error');
    });
  });

  describe('GET /api/users/:id', () => {
    test('should return user by id', async () => {
      const mockUser = {
        id: '1',
        name: 'User1',
        role: 'BUYER',
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01'),
      };

      const mockRouter = createUserRouter({
        getUserById: async () => mockUser,
      });

      app.use('/api/users', mockRouter);
      const response = await request(app).get('/api/users/1');

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(response.body.id, mockUser.id);
      assert.deepStrictEqual(response.body.name, mockUser.name);
    });

    test('should return 404 if user not found', async () => {
      const mockRouter = createUserRouter({
        getUserById: async () => {
          throw new Error('User not found');
        },
      });

      app.use('/api/users', mockRouter);
      const response = await request(app).get('/api/users/999');

      assert.strictEqual(response.status, 404);
      assert.strictEqual(response.body.message, 'User not found');
    });
  });

  describe('PATCH /api/users/:id/role', () => {
    test('should update user role successfully', async () => {
      const mockUser = { id: '1', name: 'User1', role: 'SELLER', status: 'ACTIVE' };

      const mockRouter = createUserRouter({
        updateUserRole: async () => mockUser,
      });

      app.use('/api/users', mockRouter);
      const response = await request(app)
        .patch('/api/users/1/role')
        .send({ role: 'SELLER' });

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(response.body, mockUser);
    });

    test('should return 400 for invalid role', async () => {
      const mockRouter = createUserRouter();
      app.use('/api/users', mockRouter);

      const response = await request(app)
        .patch('/api/users/1/role')
        .send({ role: 'INVALID' });

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.message, 'Invalid role');
    });

    test('should return 404 if user not found', async () => {
      const mockRouter = createUserRouter({
        updateUserRole: async () => {
          throw new Error('User not found');
        },
      });

      app.use('/api/users', mockRouter);
      const response = await request(app)
        .patch('/api/users/999/role')
        .send({ role: 'SELLER' });

      assert.strictEqual(response.status, 404);
      assert.strictEqual(response.body.message, 'User not found');
    });
  });

  describe('PATCH /api/users/:id/status', () => {
    test('should update user status successfully', async () => {
      const mockUser = { id: '1', name: 'User1', role: 'BUYER', status: 'SUSPENDED' };

      const mockRouter = createUserRouter({
        updateUserStatus: async () => mockUser,
      });

      app.use('/api/users', mockRouter);
      const response = await request(app)
        .patch('/api/users/1/status')
        .send({ status: 'SUSPENDED' });

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(response.body, mockUser);
    });

    test('should return 400 for invalid status', async () => {
      const mockRouter = createUserRouter();
      app.use('/api/users', mockRouter);

      const response = await request(app)
        .patch('/api/users/1/status')
        .send({ status: 'INVALID' });

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.message, 'Invalid status');
    });

    test('should return 404 if user not found', async () => {
      const mockRouter = createUserRouter({
        updateUserStatus: async () => {
          throw new Error('User not found');
        },
      });

      app.use('/api/users', mockRouter);
      const response = await request(app)
        .patch('/api/users/999/status')
        .send({ status: 'SUSPENDED' });

      assert.strictEqual(response.status, 404);
      assert.strictEqual(response.body.message, 'User not found');
    });
  });
});