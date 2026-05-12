import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getAllUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
} from '../../src/modules/user/user.service.js';

describe('User Service Tests', () => {
  describe('getAllUsers', () => {
    test('should return all users with mock DB', async () => {
      const mockUsers = [
        { id: '1', name: 'User1', role: 'BUYER', status: 'ACTIVE' },
        { id: '2', name: 'User2', role: 'SELLER', status: 'ACTIVE' },
      ];

      const mockDb = {
        user: {
          findMany: async () => mockUsers,       //mock prisma method
        },
      };

      const result = await getAllUsers(mockDb);
      assert.deepStrictEqual(result, mockUsers);
    });
  });

  describe('getUserById', () => {
    test('should return user if found', async () => {
      const mockUser = {
        id: '1',
        name: 'User1',
        role: 'BUYER',
        status: 'ACTIVE',
        createdAt: new Date(),
      };

      const mockDb = {
        user: {
          findUnique: async () => mockUser,
        },
      };

      const result = await getUserById('1', mockDb);
      assert.deepStrictEqual(result, mockUser);
    });

    test('should throw error if user not found', async () => {
      const mockDb = {
        user: {
          findUnique: async () => null,
        },
      };

      await assert.rejects(
        async () => await getUserById('1', mockDb),
        /User not found/
      );
    });
  });

  describe('updateUserRole', () => {
    test('should update role successfully', async () => {
      const existingUser = { id: '1', name: 'User1', role: 'BUYER', status: 'ACTIVE' };
      const updatedUser = { id: '1', name: 'User1', role: 'SELLER', status: 'ACTIVE' };

      const mockDb = {
        user: {
          findUnique: async () => existingUser,
          update: async () => updatedUser,
        },
      };

      const result = await updateUserRole('1', 'SELLER', mockDb);
      assert.deepStrictEqual(result, updatedUser);
    });

    test('should throw error if user not found', async () => {
      const mockDb = {
        user: {
          findUnique: async () => null,
        },
      };

      await assert.rejects(
        async () => await updateUserRole('1', 'SELLER', mockDb),
        /User not found/
      );
    });

    test('should throw error for invalid role', async () => {
      const mockUser = { id: '1', name: 'User1', role: 'BUYER', status: 'ACTIVE' };
      const mockDb = {
        user: {
          findUnique: async () => mockUser,
        },
      };

      await assert.rejects(
        async () => await updateUserRole('1', 'INVALID' as any, mockDb),
        /Invalid role/
      );
    });
  });

  describe('updateUserStatus', () => {
    test('should update status successfully', async () => {
      const existingUser = { id: '1', name: 'User1', role: 'BUYER', status: 'ACTIVE' };
      const updatedUser = { id: '1', name: 'User1', role: 'BUYER', status: 'SUSPENDED' };

      const mockDb = {
        user: {
          findUnique: async () => existingUser,
          update: async () => updatedUser,
        },
      };

      const result = await updateUserStatus('1', 'SUSPENDED', mockDb);
      assert.deepStrictEqual(result, updatedUser);
    });

    test('should throw error if user not found', async () => {
      const mockDb = {
        user: {
          findUnique: async () => null,
        },
      };

      await assert.rejects(
        async () => await updateUserStatus('1', 'SUSPENDED', mockDb),
        /User not found/
      );
    });

    test('should throw error for invalid status', async () => {
      const mockUser = { id: '1', name: 'User1', role: 'BUYER', status: 'ACTIVE' };
      const mockDb = {
        user: {
          findUnique: async () => mockUser,
        },
      };

      await assert.rejects(
        async () => await updateUserStatus('1', 'INVALID' as any, mockDb),
        /Invalid status/
      );
    });
  });
});