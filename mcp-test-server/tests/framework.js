/**
 * Test Framework - Simple test runner and assertion library for game tests
 */

import { TestSession, setActiveSession, clearActiveSession } from '../src/TestSession.js';
import * as verifier from '../src/StateVerifier.js';

// Test registry
const tests = [];
let currentSuite = 'default';

/**
 * Define a test
 */
export function test(name, fn) {
  tests.push({
    suite: currentSuite,
    name,
    fn,
  });
}

/**
 * Set current test suite
 */
export function describe(suiteName, fn) {
  const prevSuite = currentSuite;
  currentSuite = suiteName;
  fn();
  currentSuite = prevSuite;
}

/**
 * Assertion library
 */
export function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan(n) {
      if (!(actual > n)) {
        throw new Error(`Expected ${actual} to be greater than ${n}`);
      }
    },
    toBeLessThan(n) {
      if (!(actual < n)) {
        throw new Error(`Expected ${actual} to be less than ${n}`);
      }
    },
    toBeGreaterThanOrEqual(n) {
      if (!(actual >= n)) {
        throw new Error(`Expected ${actual} to be greater than or equal to ${n}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected ${actual} to be truthy`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected ${actual} to be falsy`);
      }
    },
    toContain(item) {
      if (typeof actual === 'string') {
        if (!actual.includes(item)) {
          throw new Error(`Expected "${actual}" to contain "${item}"`);
        }
      } else if (Array.isArray(actual)) {
        if (!actual.includes(item)) {
          throw new Error(`Expected array to contain ${JSON.stringify(item)}`);
        }
      }
    },
    toHaveProperty(prop) {
      if (!(prop in actual)) {
        throw new Error(`Expected object to have property "${prop}"`);
      }
    },
    toMatchObject(expected) {
      for (const [key, value] of Object.entries(expected)) {
        if (actual[key] !== value) {
          throw new Error(`Expected ${key} to be ${JSON.stringify(value)}, got ${JSON.stringify(actual[key])}`);
        }
      }
    },
  };
}

/**
 * Setup utilities
 */
export const setup = {
  async player(config = {}) {
    const session = new TestSession(config);
    await session.connect();
    setActiveSession(session);
    return session;
  },

  async playerStats(playerId, stats) {
    for (const [key, value] of Object.entries(stats)) {
      await verifier.query(`UPDATE players SET ${key} = $1 WHERE id = $2`, [value, playerId]);
    }
    return verifier.queryOne('SELECT * FROM players WHERE id = $1', [playerId]);
  },

  async npcConfig(npcId, config) {
    for (const [key, value] of Object.entries(config)) {
      await verifier.query(`UPDATE scriptable_npcs SET ${key} = $1 WHERE id = $2`, [value, npcId]);
    }
    return verifier.queryOne('SELECT * FROM scriptable_npcs WHERE id = $1', [npcId]);
  },
};

/**
 * Teardown utilities
 */
export const teardown = {
  async session() {
    clearActiveSession();
  },

  async cleanup() {
    // Clean up test items
    await verifier.query("DELETE FROM player_items WHERE item_name LIKE 'test_%'");
    await verifier.query("DELETE FROM room_items WHERE item_name LIKE 'test_%'");
  },
};

/**
 * Run all tests
 */
export async function runAllTests() {
  const results = {
    total: tests.length,
    passed: 0,
    failed: 0,
    errors: [],
  };

  console.log(`Running ${tests.length} tests...\n`);

  for (const testCase of tests) {
    try {
      console.log(`  Running: ${testCase.suite} > ${testCase.name}`);
      await testCase.fn();
      results.passed++;
      console.log(`  ✅ PASS: ${testCase.name}`);
    } catch (error) {
      results.failed++;
      results.errors.push({
        suite: testCase.suite,
        name: testCase.name,
        error: error.message,
      });
      console.log(`  ❌ FAIL: ${testCase.name}`);
      console.log(`     Error: ${error.message}`);
    }

    // Clean up between tests
    clearActiveSession();
  }

  console.log(`\n========================================`);
  console.log(`Tests: ${results.passed}/${results.total} passed`);
  if (results.failed > 0) {
    console.log(`\nFailed tests:`);
    for (const err of results.errors) {
      console.log(`  - ${err.suite} > ${err.name}: ${err.error}`);
    }
  }

  return results;
}

/**
 * Run tests matching a filter
 */
export async function runTests(filter = null) {
  const testsToRun = filter
    ? tests.filter((t) => t.suite.includes(filter) || t.name.includes(filter))
    : tests;

  const results = {
    total: testsToRun.length,
    passed: 0,
    failed: 0,
    errors: [],
  };

  for (const testCase of testsToRun) {
    try {
      await testCase.fn();
      results.passed++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        suite: testCase.suite,
        name: testCase.name,
        error: error.message,
      });
    }
    clearActiveSession();
  }

  return results;
}

/**
 * Wait utility
 */
export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


