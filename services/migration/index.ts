/**
 * Migration Services - Central Export
 */

import { migrationService } from './localStorage-migration.service';
import { migrationV2Service, type MigrationResult, type MigrationStatus } from './migration-v2.service';

export { migrationService } from './localStorage-migration.service';
export { migrationV2Service, type MigrationResult, type MigrationStatus } from './migration-v2.service';

/**
 * Migration result summary
 */
export interface MigrationSummary {
  v1: { success: boolean; error?: string };
  v2: MigrationResult | null;
}

/**
 * Run all migrations in sequence
 */
export async function runMigrations(): Promise<MigrationSummary> {
  console.log('[Migration] Running migrations...');
  
  const summary: MigrationSummary = {
    v1: { success: false },
    v2: null,
  };
  
  // Step 1: Run localStorage migration (V1)
  const v1Result = await migrationService.migrate();
  summary.v1 = v1Result;
  
  if (!v1Result.success) {
    console.error('[Migration] V1 migration failed:', v1Result.error);
    // Continue with V2 migration anyway
  } else {
    console.log('[Migration] V1 migration completed');
  }
  
  // Step 2: Run V2 migration (to Meeting-centric architecture)
  try {
    const needsV2 = await migrationV2Service.needsMigration();
    
    if (needsV2) {
      console.log('[Migration] Running V2 migration...');
      summary.v2 = await migrationV2Service.migrate();
      
      if (summary.v2.success) {
        console.log('[Migration] V2 migration completed:', summary.v2.migratedCount, 'meetings migrated');
      } else {
        console.error('[Migration] V2 migration failed:', summary.v2.errors);
      }
    } else {
      console.log('[Migration] V2 migration not needed');
      summary.v2 = {
        success: true,
        migratedCount: 0,
        skippedCount: 1,
        errors: [],
      };
    }
  } catch (error) {
    console.error('[Migration] V2 migration error:', error);
    summary.v2 = {
      success: false,
      migratedCount: 0,
      skippedCount: 0,
      errors: [`V2 migration error: ${error}`],
    };
  }
  
  console.log('[Migration] All migrations completed');
  return summary;
}

/**
 * Get current migration status
 */
export async function getMigrationStatus(): Promise<{
  v1Migrated: boolean;
  v2Status: MigrationStatus | null;
}> {
  return {
    v1Migrated: migrationService.hasMigrated(),
    v2Status: await migrationV2Service.getMigrationStatus(),
  };
}

/**
 * Get migration statistics
 */
export async function getMigrationStats() {
  return await migrationV2Service.getStats();
}
