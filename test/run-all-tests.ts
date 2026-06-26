/// <reference types="node" />
import { execSync } from 'child_process';
import path from 'path';

const tests = [
  'test-cart-validation.ts',
  'test-cart-expiration.ts',
  'test-cart-operations.ts',
  'test-cart-totals.ts',
  'test-cart-multi-seller.ts',
];

const SEPARATOR = '═'.repeat(60);
const results: { name: string; status: 'PASSED' | 'FAILED' }[] = [];

console.log('\n' + SEPARATOR);
console.log('  🚀 FRESHROUTE — CART MODULE TEST SUITE');
console.log(SEPARATOR + '\n');

for (const test of tests) {
  const testPath = path.join('test', test);
  console.log(SEPARATOR);
  console.log(`▶  Running: ${test}`);
  console.log(SEPARATOR);

  try {
    execSync(`npx tsx ${testPath}`, { stdio: 'inherit' });
    results.push({ name: test, status: 'PASSED' });
  } catch {
    results.push({ name: test, status: 'FAILED' });
  }
}

// ── FINAL SUMMARY ────────────────────────────────────────────────────────────
console.log('\n' + SEPARATOR);
console.log('  📊 TEST SUITE SUMMARY');
console.log(SEPARATOR);

let passed = 0;
let failed = 0;

for (const result of results) {
  if (result.status === 'PASSED') {
    console.log(`  ✅ PASSED  →  ${result.name}`);
    passed++;
  } else {
    console.log(`  ❌ FAILED  →  ${result.name}`);
    failed++;
  }
}

console.log(SEPARATOR);
console.log(`  Total: ${tests.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
console.log(SEPARATOR + '\n');
