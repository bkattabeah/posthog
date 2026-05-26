# ClickHouse Migration Rollback Patterns

This document covers patterns for safely rolling back ClickHouse migrations in PostHog.

## Overview

ClickHouse migrations are generally **not reversible** in the traditional sense due to the append-only nature of many ClickHouse operations. However, there are strategies to handle rollbacks safely.

## When Rollbacks Are Possible

### Adding a Nullable Column

If you added a nullable column, you can drop it in a rollback:

```python
from posthog.clickhouse.migrations.base import Migration


class Migration(Migration):
    operations = [
        # Forward: add nullable column
        # operations.run_sql(
        #     "ALTER TABLE events ON CLUSTER '{cluster}' ADD COLUMN IF NOT EXISTS my_new_col Nullable(String)"
        # )
    ]

    # Rollback: drop the column
    rollback_operations = [
        operations.run_sql(
            "ALTER TABLE events ON CLUSTER '{cluster}' DROP COLUMN IF EXISTS my_new_col"
        )
    ]
```

**Note:** Dropping columns with data is destructive and irreversible.

## When Rollbacks Are NOT Safe

### Dropping a Column

Once a column is dropped, data is permanently lost. There is no rollback.

```python
# DO NOT attempt to rollback a DROP COLUMN
# The data is gone once the migration runs.
```

### Changing Column Types

Type changes (e.g., `String` → `UInt64`) may lose data precision or fail entirely on existing rows.

```python
# Prefer adding a new column with the desired type
# and backfilling, rather than altering in-place.
```

### Renaming a Column

Renaming breaks any queries, materialized views, or application code referencing the old name.

## Safe Migration Strategies

### Dual-Write Pattern

When changing a column type or name, use a dual-write approach:

1. **Step 1**: Add the new column alongside the old one.
2. **Step 2**: Backfill the new column from the old column.
3. **Step 3**: Update application code to write to both columns.
4. **Step 4**: Update application code to read from the new column.
5. **Step 5**: Drop the old column in a later migration.

```python
class Migration(Migration):
    """
    Step 1: Add new column for dual-write migration.
    Old column: `person_id` (String)
    New column: `person_id_v2` (UUID)
    """
    operations = [
        operations.run_sql(
            """
            ALTER TABLE person ON CLUSTER '{cluster}'
            ADD COLUMN IF NOT EXISTS person_id_v2 UUID DEFAULT toUUID(person_id)
            """
        )
    ]
```

### Feature Flag Guard Pattern

Wrap reads from a new column behind a feature flag so you can revert at the application level without a DB rollback:

```python
# In application code:
if posthog.feature_enabled("use-new-person-id-column", distinct_id):
    query = "SELECT person_id_v2 FROM person WHERE ..."
else:
    query = "SELECT person_id FROM person WHERE ..."
```

## Tracking Migration State

PostHog tracks applied migrations in the `posthog_migrations` table (Django) and a separate ClickHouse state table. Always verify state before attempting a rollback:

```sql
-- Check which ClickHouse migrations have been applied
SELECT migration_name, applied_at
FROM posthog_clickhouse_migrations
ORDER BY applied_at DESC
LIMIT 20;
```

## Emergency Rollback Checklist

1. **Stop writes** to the affected table if possible (put the service in maintenance mode).
2. **Assess data loss**: Determine if the migration was destructive.
3. **Check replicas**: ClickHouse replication may have already propagated the change.
4. **Restore from backup** if data was lost and a recent snapshot exists.
5. **Reverse application code** changes before reversing DB schema if using dual-write.
6. **Document the incident** and update migration tooling to prevent recurrence.

## References

- [ClickHouse ALTER TABLE docs](https://clickhouse.com/docs/en/sql-reference/statements/alter/)
- [Migration Patterns](./migration-patterns.md)
- [Examples](./examples.md)
