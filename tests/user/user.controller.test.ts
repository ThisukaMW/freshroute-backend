import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createControllers } from '../../src/modules/user/user.controller.js';

describe('User Controller Tests', () => {
  let mockReq: any;
  let mockRes: any;
  let callStack: any;

  beforeEach(() => {
    // Mock response
    mockRes = {
      json: (data: any) => {
        callStack.jsonCalls.push(data);
        return mockRes;
      },
      status: (code: number) => {
        callStack.statusCalls.push(code);
        return mockRes;
      },
    };

    callStack = {
      jsonCalls: [],
      statusCalls: [],
    };

    mockReq = {
      params: {},
      body: {},
    };
  });

  describe('getUsers', () => {
    test('should return users successfully', async () => {
      const mockUsers = [{ id: '1', name: 'User1', role: 'BUYER', status: 'ACTIVE' }];
      const mockGetAllUsers = async () => mockUsers;
      const { getUsers } = createControllers({ getAllUsers: mockGetAllUsers });

      await getUsers(mockReq, mockRes);

      assert.deepStrictEqual(callStack.jsonCalls[0], mockUsers);
      assert.strictEqual(callStack.statusCalls.length, 0);
    });

    test('should handle errors', async () => {
      const mockGetAllUsers = async () => {
        throw new Error('DB Error');
      };
      const { getUsers } = createControllers({ getAllUsers: mockGetAllUsers });

      await getUsers(mockReq, mockRes);

      assert.strictEqual(callStack.statusCalls[0], 500);
      assert.strictEqual(callStack.jsonCalls[0].message, 'DB Error');
    });
  });

  describe('getUser', () => {
    test('should return user successfully', async () => {
      const mockUser = { id: '1', name: 'User1', role: 'BUYER', status: 'ACTIVE', createdAt: new Date() };
      mockReq.params.id = '1';
      const mockGetUserById = async () => mockUser;
      const { getUser } = createControllers({ getUserById: mockGetUserById });

      await getUser(mockReq, mockRes);

      assert.deepStrictEqual(callStack.jsonCalls[0], mockUser);
      assert.strictEqual(callStack.statusCalls.length, 0);
    });

    test('should return 404 if user not found', async () => {
      mockReq.params.id = '1';
      const mockGetUserById = async () => {
        throw new Error('User not found');
      };
      const { getUser } = createControllers({ getUserById: mockGetUserById });

      await getUser(mockReq, mockRes);

      assert.strictEqual(callStack.statusCalls[0], 404);
      assert.strictEqual(callStack.jsonCalls[0].message, 'User not found');
    });
  });

  describe('patchUserRole', () => {
    test('should update role successfully', async () => {
      const mockUser = { id: '1', name: 'User1', role: 'SELLER', status: 'ACTIVE' };
      mockReq.params.id = '1';
      mockReq.body.role = 'SELLER';
      const mockUpdateUserRole = async () => mockUser;
      const { patchUserRole } = createControllers({ updateUserRole: mockUpdateUserRole });

      await patchUserRole(mockReq, mockRes);

      assert.deepStrictEqual(callStack.jsonCalls[0], mockUser);
      assert.strictEqual(callStack.statusCalls.length, 0);
    });

    test('should return 400 for invalid role', async () => {
      mockReq.params.id = '1';
      mockReq.body.role = 'INVALID';
      const { patchUserRole } = createControllers();

      await patchUserRole(mockReq, mockRes);

      assert.strictEqual(callStack.statusCalls[0], 400);
      assert.strictEqual(callStack.jsonCalls[0].message, 'Invalid role');
    });

    test('should return 404 if user not found', async () => {
      mockReq.params.id = '1';
      mockReq.body.role = 'SELLER';
      const mockUpdateUserRole = async () => {
        throw new Error('User not found');
      };
      const { patchUserRole } = createControllers({ updateUserRole: mockUpdateUserRole });

      await patchUserRole(mockReq, mockRes);

      assert.strictEqual(callStack.statusCalls[0], 404);
      assert.strictEqual(callStack.jsonCalls[0].message, 'User not found');
    });
  });

  describe('patchUserStatus', () => {
    test('should update status successfully', async () => {
      const mockUser = { id: '1', name: 'User1', role: 'BUYER', status: 'SUSPENDED' };
      mockReq.params.id = '1';
      mockReq.body.status = 'SUSPENDED';
      const mockUpdateUserStatus = async () => mockUser;
      const { patchUserStatus } = createControllers({ updateUserStatus: mockUpdateUserStatus });

      await patchUserStatus(mockReq, mockRes);

      assert.deepStrictEqual(callStack.jsonCalls[0], mockUser);
      assert.strictEqual(callStack.statusCalls.length, 0);
    });

    test('should return 400 for invalid status', async () => {
      mockReq.params.id = '1';
      mockReq.body.status = 'INVALID';
      const { patchUserStatus } = createControllers();

      await patchUserStatus(mockReq, mockRes);

      assert.strictEqual(callStack.statusCalls[0], 400);
      assert.strictEqual(callStack.jsonCalls[0].message, 'Invalid status');
    });

    test('should return 404 if user not found', async () => {
      mockReq.params.id = '1';
      mockReq.body.status = 'SUSPENDED';
      const mockUpdateUserStatus = async () => {
        throw new Error('User not found');
      };
      const { patchUserStatus } = createControllers({ updateUserStatus: mockUpdateUserStatus });

      await patchUserStatus(mockReq, mockRes);

      assert.strictEqual(callStack.statusCalls[0], 404);
      assert.strictEqual(callStack.jsonCalls[0].message, 'User not found');
    });
  });
});