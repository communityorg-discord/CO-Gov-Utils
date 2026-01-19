/**
 * Database Test Script
 * Tests CRUD operations to ensure database is working
 */

require('dotenv').config();
const { initDatabase, query, queryOne, execute, closeDatabase } = require('../utils/database');
const { initTables } = require('./db-init');

async function runTests() {
    console.log('═══════════════════════════════════════');
    console.log('       DATABASE CONNECTION TEST');
    console.log('═══════════════════════════════════════\n');

    let passed = 0;
    let failed = 0;

    // Test 1: Initialize database
    console.log('[Test 1] Initializing database...');
    try {
        const db = initDatabase();
        if (db) {
            console.log('  ✓ Database initialized successfully');
            passed++;
        } else {
            throw new Error('No database returned');
        }
    } catch (e) {
        console.log(`  ✗ Failed: ${e.message}`);
        failed++;
        console.log('\nCannot proceed without database. Exiting.');
        process.exit(1);
    }

    // Test 2: Initialize tables
    console.log('\n[Test 2] Creating/verifying tables...');
    try {
        await initTables();
        console.log('  ✓ Tables created/verified');
        passed++;
    } catch (e) {
        console.log(`  ✗ Failed: ${e.message}`);
        failed++;
    }

    // Test 3: INSERT operation
    console.log('\n[Test 3] Testing INSERT...');
    const testGuildId = 'TEST_GUILD_' + Date.now();
    const testUserId = 'TEST_USER_' + Date.now();
    try {
        const result = execute(`
      INSERT INTO audit_log (guild_id, action, actor_id, details)
      VALUES (?, ?, ?, ?)
    `, [testGuildId, 'TEST_ACTION', testUserId, 'Test insert for verification']);

        if (result.changes > 0) {
            console.log(`  ✓ INSERT successful (ID: ${result.lastInsertRowid})`);
            passed++;
        } else {
            throw new Error('No rows inserted');
        }
    } catch (e) {
        console.log(`  ✗ INSERT failed: ${e.message}`);
        failed++;
    }

    // Test 4: SELECT/query operation
    console.log('\n[Test 4] Testing SELECT (query)...');
    try {
        const rows = query(`
      SELECT * FROM audit_log WHERE guild_id = ?
    `, [testGuildId]);

        if (rows.length > 0) {
            console.log(`  ✓ SELECT successful (found ${rows.length} row(s))`);
            console.log(`    → Action: ${rows[0].action}, Actor: ${rows[0].actor_id}`);
            passed++;
        } else {
            throw new Error('No rows found');
        }
    } catch (e) {
        console.log(`  ✗ SELECT failed: ${e.message}`);
        failed++;
    }

    // Test 5: queryOne operation
    console.log('\n[Test 5] Testing queryOne...');
    try {
        const row = queryOne(`
      SELECT * FROM audit_log WHERE guild_id = ? LIMIT 1
    `, [testGuildId]);

        if (row) {
            console.log(`  ✓ queryOne successful`);
            console.log(`    → ID: ${row.id}, Created: ${row.created_at}`);
            passed++;
        } else {
            throw new Error('No row returned');
        }
    } catch (e) {
        console.log(`  ✗ queryOne failed: ${e.message}`);
        failed++;
    }

    // Test 6: UPDATE operation
    console.log('\n[Test 6] Testing UPDATE...');
    try {
        const result = execute(`
      UPDATE audit_log SET details = ? WHERE guild_id = ?
    `, ['Updated test details', testGuildId]);

        if (result.changes > 0) {
            console.log(`  ✓ UPDATE successful (${result.changes} row(s) updated)`);
            passed++;
        } else {
            throw new Error('No rows updated');
        }
    } catch (e) {
        console.log(`  ✗ UPDATE failed: ${e.message}`);
        failed++;
    }

    // Test 7: Verify UPDATE
    console.log('\n[Test 7] Verifying UPDATE...');
    try {
        const row = queryOne(`SELECT details FROM audit_log WHERE guild_id = ?`, [testGuildId]);
        if (row && row.details === 'Updated test details') {
            console.log(`  ✓ UPDATE verified`);
            passed++;
        } else {
            throw new Error('Update not reflected');
        }
    } catch (e) {
        console.log(`  ✗ Verify failed: ${e.message}`);
        failed++;
    }

    // Test 8: DELETE operation
    console.log('\n[Test 8] Testing DELETE...');
    try {
        const result = execute(`DELETE FROM audit_log WHERE guild_id = ?`, [testGuildId]);

        if (result.changes > 0) {
            console.log(`  ✓ DELETE successful (${result.changes} row(s) deleted)`);
            passed++;
        } else {
            throw new Error('No rows deleted');
        }
    } catch (e) {
        console.log(`  ✗ DELETE failed: ${e.message}`);
        failed++;
    }

    // Test 9: Verify DELETE
    console.log('\n[Test 9] Verifying DELETE...');
    try {
        const row = queryOne(`SELECT * FROM audit_log WHERE guild_id = ?`, [testGuildId]);
        if (!row) {
            console.log(`  ✓ DELETE verified (row removed)`);
            passed++;
        } else {
            throw new Error('Row still exists');
        }
    } catch (e) {
        console.log(`  ✗ Verify failed: ${e.message}`);
        failed++;
    }

    // Test 10: Test permission_grants table (specific to your new features)
    console.log('\n[Test 10] Testing permission_grants table...');
    try {
        const result = execute(`
      INSERT OR REPLACE INTO permission_grants 
      (guild_id, user_id, user_tag, permission_type, permission_value, granted_by, granted_by_tag, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [testGuildId, testUserId, 'TestUser#0001', 'level', 'MODERATOR', 'admin123', 'Admin#0001', 'Test grant']);

        if (result.changes > 0) {
            console.log(`  ✓ permission_grants INSERT successful`);
            passed++;
        }

        // Verify
        const grant = queryOne(`SELECT * FROM permission_grants WHERE guild_id = ? AND user_id = ?`, [testGuildId, testUserId]);
        if (grant && grant.permission_value === 'MODERATOR') {
            console.log(`  ✓ permission_grants verified`);
            console.log(`    → Type: ${grant.permission_type}, Value: ${grant.permission_value}`);
            passed++;
        }

        // Cleanup
        execute(`DELETE FROM permission_grants WHERE guild_id = ?`, [testGuildId]);
        console.log(`  ✓ Test data cleaned up`);
        passed++;
    } catch (e) {
        console.log(`  ✗ permission_grants test failed: ${e.message}`);
        failed++;
    }

    // Test 11: Test superusers table
    console.log('\n[Test 11] Testing superusers table...');
    try {
        // Check hardcoded superusers are accessible
        const superusers = query(`SELECT * FROM superusers`);
        console.log(`  ✓ superusers table accessible (${superusers.length} dynamic superusers)`);
        passed++;
    } catch (e) {
        console.log(`  ✗ superusers test failed: ${e.message}`);
        failed++;
    }

    // Summary
    console.log('\n═══════════════════════════════════════');
    console.log('              TEST SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`  ✓ Passed: ${passed}`);
    console.log(`  ✗ Failed: ${failed}`);
    console.log(`  Total:   ${passed + failed}`);
    console.log('═══════════════════════════════════════\n');

    if (failed === 0) {
        console.log('🎉 ALL TESTS PASSED! Database is working correctly.\n');
    } else {
        console.log('⚠️  Some tests failed. Please check the errors above.\n');
    }

    closeDatabase();
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
