#!/usr/bin/env node
/**
 * Test Runner - Execute test suites from command line
 * 
 * Usage:
 *   node tests/run-tests.js              # Run all tests
 *   node tests/run-tests.js pulse        # Run tests matching "pulse"
 *   node tests/run-tests.js attunement   # Run tests matching "attunement"
 */

import { initDatabase } from '../src/StateVerifier.js';

// Initialize database connection
initDatabase();

// Import test suites to register tests
import './suites/pulse-echoes.test.js';
import './suites/attunement.test.js';

// Import and run framework
import { runAllTests, runTests } from './framework.js';

const filter = process.argv[2];

if (filter) {
  console.log(`Running tests matching: ${filter}\n`);
  const results = await runTests(filter);
  process.exit(results.failed > 0 ? 1 : 0);
} else {
  console.log('Running all tests...\n');
  const results = await runAllTests();
  process.exit(results.failed > 0 ? 1 : 0);
}



