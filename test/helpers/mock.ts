/**
 * Mock helper utilities for test isolation.
 * Handles type casting through `unknown` automatically.
 */

/**
 * Mock a Prisma or service method with automatic restoration.
 * @param target Object containing the method (e.g., prisma.batch)
 * @param method Method name to mock
 * @param implementation Replacement function
 * @returns Restore function to call in finally block
 */
export function mockMethod<T extends Record<string, any>, K extends keyof T>(
  target: T,
  method: K,
  implementation: any
): () => void {
  const original = target[method];
  target[method] = implementation as unknown as T[K];
  return () => {
    target[method] = original;
  };
}

/**
 * Mock multiple Prisma methods at once.
 * @param mocks Array of { target, method, implementation }
 * @returns Restore function to call in finally block
 */
export function mockMethods(
  mocks: Array<{ target: Record<string, any>; method: string; implementation: any }>
): () => void {
  const restorers = mocks.map(({ target, method, implementation }) =>
    mockMethod(target, method, implementation)
  );
  return () => restorers.forEach(restore => restore());
}

/**
 * Mock global functions like fetch.
 * @param name Function name on global scope
 * @param implementation Replacement function
 * @returns Restore function to call in finally block
 */
export function mockGlobal<K extends keyof typeof globalThis>(
  name: K,
  implementation: any
): () => void {
  const original = globalThis[name];
  (globalThis[name] as any) = implementation;
  return () => {
    (globalThis[name] as any) = original;
  };
}
