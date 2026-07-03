# Mock Helper Pattern Guide

## Problem: Verbose Mock Code

Your original tests had repetitive boilerplate for mocking Prisma:

```typescript
// BEFORE: 5 lines of setup + cleanup per mock
const originalFindUnique = prisma.driver.findUnique;
prisma.driver.findUnique = async () => ({...}) as unknown as typeof prisma.driver.findUnique;
try {
  // test code
} finally {
  prisma.driver.findUnique = originalFindUnique;
}
```

**Issues:**
- Repetitive save/restore pattern clutters test logic
- The `as unknown as` cast is verbose but necessary
- Hard to scan what's actually being tested vs boilerplate

---

## Solution: Mock Helper

[test/helpers/mock.ts](test/helpers/mock.ts) provides three clean utilities:

### 1. `mockMethod()` - Single Prisma Method
```typescript
// AFTER: 1 line of setup, automatic cleanup
const restore = mockMethod(prisma.driver, "findUnique", async () => ({...}));
try {
  // test code
} finally {
  restore();
}
```

**Benefits:**
- Cast is hidden inside the helper
- Intent is crystal clear: "mock this method"
- Less vertical space = easier to read test flow

### 2. `mockMethods()` - Multiple Methods
```typescript
// Mock multiple Prisma methods at once
const restore = mockMethods([
  { target: prisma.batch, method: "findUnique", implementation: async () => ({...}) },
  { target: prisma.route, method: "findMany", implementation: async () => [] },
  { target: prisma.stop, method: "create", implementation: async ({ data }: { data: any }) => ({ id: "1", ...data }) },
]);

try {
  // test code
} finally {
  restore();
}
```

### 3. `mockGlobal()` - Global Functions
```typescript
// Mock fetch, console, etc.
const restore = mockGlobal("fetch", async () => ({
  ok: true,
  json: async () => ({ matrix: [] }),
}));

try {
  // test code
} finally {
  restore();
}
```

---

## Real Example Comparison

### Driver Service Test - Before

```typescript
test("getDriverProfile returns flattened driver details", async () => {
  const originalFindUnique = prisma.driver.findUnique;
  prisma.driver.findUnique = (async () => ({
    id: "driver-1",
    vehicleNumber: "AB-123",
    vehicleType: "bike",
    vehicleCapacity: 10,
    licenseNumber: "LIC-1",
    isAvailable: true,
    averageRating: 4.8,
    totalRatings: 12,
    user: {
      name: "Asha",
      email: "asha@example.com",
      phone: "1234567890",
    },
  })) as unknown as typeof prisma.driver.findUnique;

  try {
    const profile = await driverService.getDriverProfile("driver-1");

    assert.equal(profile.name, "Asha");
    assert.equal(profile.vehicleNumber, "AB-123");
  } finally {
    prisma.driver.findUnique = originalFindUnique;
  }
});
```

**Lines:** 24 | **Boilerplate:** 5 | **Test Logic:** 4

### Driver Service Test - After

```typescript
test("getDriverProfile returns flattened driver details", async () => {
  const restore = mockMethod(prisma.driver, "findUnique", async () => ({
    id: "driver-1",
    vehicleNumber: "AB-123",
    vehicleType: "bike",
    vehicleCapacity: 10,
    licenseNumber: "LIC-1",
    isAvailable: true,
    averageRating: 4.8,
    totalRatings: 12,
    user: {
      name: "Asha",
      email: "asha@example.com",
      phone: "1234567890",
    },
  }));

  try {
    const profile = await driverService.getDriverProfile("driver-1");

    assert.equal(profile.name, "Asha");
    assert.equal(profile.vehicleNumber, "AB-123");
  } finally {
    restore();
  }
});
```

**Lines:** 21 | **Boilerplate:** 2 | **Test Logic:** 4

### Impact

- **12% fewer lines** (24 → 21)
- **60% less boilerplate** (5 → 2 lines)
- **Same test logic clarity**
- **Type safety maintained** (cast is internal)

---

## Usage Checklist for Review

✅ When judges ask "How do you mock Prisma?"
- Point to [test/helpers/mock.ts](test/helpers/mock.ts)
- Show how it abstracts the `unknown` cast
- Demonstrate it works with any object and method

✅ When judges review test code
- They'll see clean test intent without boilerplate
- The helper shows industry-standard pattern
- No repeated `as unknown as typeof` clutter

✅ When judges ask about type safety
- Explain the helper is just a wrapper
- The actual type assertion still happens internally
- All tests pass with strict TypeScript checking

---

## How to Migrate Other Tests (Optional)

If you want to refactor other test files:

1. Add import: `import { mockMethod } from "./helpers/mock.js";`
2. Replace: `const original = x; x = impl as unknown as typeof x;` → `const restore = mockMethod(x, "method", impl);`
3. Replace: `x = original;` → `restore();`
4. Run: `npm test` to validate

Example files that could benefit:
- `test/planner.service.test.ts` (7 Prisma mocks)
- `test/planner.reroute.test.ts` (5 Prisma mocks)
- `test/tracking.service.test.ts` (3 Prisma mocks)

**Already migrated:**
- ✅ `test/driver.service.test.ts` (3 Prisma mocks)
