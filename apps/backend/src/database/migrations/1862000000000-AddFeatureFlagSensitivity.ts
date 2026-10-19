import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `sensitive` marker to feature flags.
 *
 * A sensitive flag can only be changed or deleted when the request carries an
 * explicit confirmation, which the admin console collects through a
 * type-the-key dialog. The column is NOT NULL with a false default so every
 * existing flag reads as non-sensitive without a data backfill.
 */
export class AddFeatureFlagSensitivity1862000000000 implements MigrationInterface {
  name = 'AddFeatureFlagSensitivity1862000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "feature_flags"
      ADD COLUMN "sensitive" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "feature_flags"
      DROP COLUMN "sensitive"
    `);
  }
}
