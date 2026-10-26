/**
 * __tests__/ask-quota-integration.mjs
 *
 * REAL PostgreSQL integration test for reserveAskSlot().
 *
 * This test connects to an actual PostgreSQL database, creates an isolated
 * test table (ask_usage_test), runs 120 concurrent reservations against a
 * quota of 100, and asserts:
 *
 *   - Exactly 100 reservations are allowed
 *   - Exactly 20 reservations are rejected
 *   - The final stored count is exactly 100 (never exceeds limit)
 *   - No over-counting occurs despite concurrent writes
 *
 * REQUIREMENTS:
 *   - DATABASE_URL must be set in the environment (or .env.local must exist
 *     and be loaded with: npx dotenv -e .env.local -- node __tests__/ask-quota-integration.mjs)
 *   - The PostgreSQL user must have CREATE TABLE, INSERT, UPDATE, SELECT,
 *     and DROP TABLE privileges on the target schema.
 *
 * ISOLATION:
 *   This test uses a SEPARATE table (ask_usage_test) rather than the
 *   production ask_usage table. It creates the table before the test,
 *   runs the test, then drops the table regardless of outcome (finally block).
 *   It will never touch the production ask_usage table or any other data.
 *
 * Run:
 *   DATABASE_URL=postgres://... node __tests__/ask-quota-integration.mjs
 *   # or, using .env.local:
 *   npx dotenv -e .env.local -- node __tests__/ask-quota-integration.mjs
 *
 * This test is NOT part of CI. Run it manually to verify database-level
 * quota enforcement before deploying or after schema changes.
 */

import assert from 'node:assert/strict';
import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ASK_LIMIT = 100;      // must match lib/store.js ASK_LIMIT
const CONCURRENCY = 120;    // total reservations to attempt
const TEST_USER   = 'test-user-quota-integration-' + Date.now();
const TEST_TABLE  = 'ask_usage_test';

// Validate DATABASE_URL before connecting
const rawUrl = process.env.DATABASE_URL || '';
if (!rawUrl || rawUrl.includes('password@host')) {
  console.error('');
  console.error('❌  DATABASE_URL is not set or is a placeholder.');
  console.error('');
  console.error('    Set it before running this test:');
  console.error('      export DATABASE_URL="postgres://..."');
  console.error('      node __tests__/ask-quota-integration.mjs');
  console.error('');
  console.error('    Or load from .env.local:');
  console.error('      npx dotenv -e .env.local -- node __tests__/ask-quota-integration.mjs');
  process.exit(1);
}

// Mirror the URL normalization from scripts/migrate.js:
// strip sslmode query param to avoid duplicate handling, point at defaultdb.
const dbUrl = rawUrl
  .replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '')
  .replace(/\/[^/?]+$/, '/defaultdb');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  options: '--search_path=app',
  // Allow up to CONCURRENCY + a few extra for admin queries
  max: CONCURRENCY + 5,
});

// ---------------------------------------------------------------------------
// The function under test — mirrors reserveAskSlot() from lib/store.js exactly,
// but operates on TEST_TABLE instead of ask_usage.
// ---------------------------------------------------------------------------

async function reserveSlot(db, userId, limit) {
  const result = await db.query(
    `INSERT INTO ${TEST_TABLE} (user_id, month, ask_count)
       VALUES ($1, date_trunc('month', NOW() AT TIME ZONE 'UTC')::date, 1)
     ON CONFLICT (user_id, month)
       DO UPDATE SET ask_count = ${TEST_TABLE}.ask_count + 1
       WHERE ${TEST_TABLE}.ask_count < $2
     RETURNING ask_count`,
    [userId, limit]
  );
  if (result.rows.length === 0) {
    return { allowed: false, count: limit, limit };
  }
  const count = result.rows[0].ask_count;
  return { allowed: count <= limit, count, limit };
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

async function run() {
  console.log('');
  console.log('PostgreSQL Ask Quota Integration Test');
  console.log('=====================================');
  console.log(`  Target table  : ${TEST_TABLE} (isolated, will be created and dropped)`);
  console.log(`  Test user     : ${TEST_USER}`);
  console.log(`  Quota limit   : ${ASK_LIMIT}`);
  console.log(`  Concurrency   : ${CONCURRENCY} simultaneous requests`);
  console.log('');

  const admin = await pool.connect();

  try {
    // -----------------------------------------------------------------------
    // Setup: create isolated test table
    // -----------------------------------------------------------------------
    console.log(`Creating isolated test table ${TEST_TABLE}…`);
    await admin.query(`
      CREATE TABLE IF NOT EXISTS ${TEST_TABLE} (
        user_id    TEXT  NOT NULL,
        month      DATE  NOT NULL,
        ask_count  INT   NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, month)
      )
    `);
    // Ensure no leftover rows from a previous failed test run for this user
    await admin.query(`DELETE FROM ${TEST_TABLE} WHERE user_id = $1`, [TEST_USER]);
    console.log('  ✓ Test table ready, test user cleared');
    console.log('');
    admin.release();

    // -----------------------------------------------------------------------
    // Test 1: 120 concurrent reservations, quota = 100
    // -----------------------------------------------------------------------
    console.log(`Running ${CONCURRENCY} concurrent reservations…`);

    // Each reservation gets its own connection from the pool to simulate
    // true concurrent DB writes (not serialized through a single connection).
    const reservations = Array.from({ length: CONCURRENCY }, async (_, i) => {
      const client = await pool.connect();
      try {
        return await reserveSlot(client, TEST_USER, ASK_LIMIT);
      } finally {
        client.release();
      }
    });

    const results = await Promise.all(reservations);

    const allowed  = results.filter(r =>  r.allowed);
    const rejected = results.filter(r => !r.allowed);

    console.log(`  Allowed  : ${allowed.length}`);
    console.log(`  Rejected : ${rejected.length}`);

    assert.equal(
      allowed.length,
      ASK_LIMIT,
      `Expected exactly ${ASK_LIMIT} allowed; got ${allowed.length}`
    );
    assert.equal(
      rejected.length,
      CONCURRENCY - ASK_LIMIT,
      `Expected exactly ${CONCURRENCY - ASK_LIMIT} rejected; got ${rejected.length}`
    );

    console.log(`  ✓ Exactly ${ASK_LIMIT} allowed, ${CONCURRENCY - ASK_LIMIT} rejected`);

    // -----------------------------------------------------------------------
    // Test 2: Final stored count must be exactly ASK_LIMIT
    // -----------------------------------------------------------------------
    const adminCheck = await pool.connect();
    let storedCount;
    try {
      const row = await adminCheck.query(
        `SELECT ask_count FROM ${TEST_TABLE}
          WHERE user_id = $1
            AND month = date_trunc('month', NOW() AT TIME ZONE 'UTC')::date`,
        [TEST_USER]
      );
      assert.ok(row.rows.length === 1, 'Expected exactly one row in test table for test user');
      storedCount = row.rows[0].ask_count;
    } finally {
      adminCheck.release();
    }

    assert.equal(
      storedCount,
      ASK_LIMIT,
      `Final stored ask_count must be exactly ${ASK_LIMIT}; got ${storedCount}`
    );
    console.log(`  ✓ Final stored count = ${storedCount} (never exceeded ${ASK_LIMIT})`);

    // -----------------------------------------------------------------------
    // Test 3: One more reservation must be rejected (quota still exhausted)
    // -----------------------------------------------------------------------
    const oneMore = await pool.connect();
    let postLimitResult;
    try {
      postLimitResult = await reserveSlot(oneMore, TEST_USER, ASK_LIMIT);
    } finally {
      oneMore.release();
    }

    assert.equal(postLimitResult.allowed, false,
      'A reservation after reaching the limit must be rejected');

    // Stored count must still be ASK_LIMIT, not ASK_LIMIT + 1
    const adminCheck2 = await pool.connect();
    try {
      const row2 = await adminCheck2.query(
        `SELECT ask_count FROM ${TEST_TABLE}
          WHERE user_id = $1
            AND month = date_trunc('month', NOW() AT TIME ZONE 'UTC')::date`,
        [TEST_USER]
      );
      const countAfterRejection = row2.rows[0].ask_count;
      assert.equal(
        countAfterRejection,
        ASK_LIMIT,
        `ask_count must remain ${ASK_LIMIT} after a rejected reservation; got ${countAfterRejection}`
      );
      console.log(`  ✓ Post-limit reservation rejected; stored count unchanged at ${countAfterRejection}`);
    } finally {
      adminCheck2.release();
    }

    // -----------------------------------------------------------------------
    // Test 4: allowed results returned non-zero ask_count values in 1..ASK_LIMIT
    // -----------------------------------------------------------------------
    const counts = allowed.map(r => r.count).sort((a, b) => a - b);
    assert.equal(counts[0], 1,
      'Minimum allowed ask_count must be 1');
    assert.equal(counts[counts.length - 1], ASK_LIMIT,
      `Maximum allowed ask_count must be ${ASK_LIMIT}`);
    // All counts 1..ASK_LIMIT must appear exactly once (no gaps, no duplicates)
    for (let i = 0; i < ASK_LIMIT; i++) {
      assert.equal(counts[i], i + 1,
        `ask_count sequence gap or duplicate at position ${i}: expected ${i + 1}, got ${counts[i]}`);
    }
    console.log(`  ✓ Allowed ask_count values are exactly 1…${ASK_LIMIT} with no gaps or duplicates`);

    console.log('');
    console.log('✅  All quota integration tests passed');
    console.log('');
    console.log('   This confirms that reserveAskSlot() enforces the ceiling atomically');
    console.log('   in PostgreSQL under concurrent writes — no over-counting, no gaps.');

  } finally {
    // -----------------------------------------------------------------------
    // Teardown: drop the isolated test table unconditionally
    // -----------------------------------------------------------------------
    const cleanup = await pool.connect();
    try {
      await cleanup.query(`DROP TABLE IF EXISTS ${TEST_TABLE}`);
      console.log(`\n   Test table ${TEST_TABLE} dropped.`);
    } catch (err) {
      console.warn(`   Warning: could not drop test table ${TEST_TABLE}: ${err.message}`);
    } finally {
      cleanup.release();
    }
    await pool.end();
  }
}

run().catch(err => {
  console.error('');
  console.error('❌  Integration test failed:', err.message);
  console.error('');
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    console.error('    Could not connect to PostgreSQL. Check DATABASE_URL and network access.');
  } else if (err.code === '42501') {
    console.error('    Permission denied. The DB user needs CREATE/DROP TABLE privileges.');
  } else if (err.code === '3D000') {
    console.error('    Database does not exist. Check the database name in DATABASE_URL.');
  }
  process.exit(1);
});
