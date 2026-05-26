# ClickHouse Migration Patterns

This document describes common patterns and best practices for writing ClickHouse migrations in PostHog.

## Overview

ClickHouse migrations are managed differently from Django/PostgreSQL migrations. They are stored in `posthog/migrations/` and executed in order based on their numeric prefix.

## File Naming Convention

Migrations follow the pattern:
```
{number}_{description}.py
```

Example: `0023_add_session_replay_columns.py`

## Basic Migration Structure

```python
from infi.clickhouse_orm import migrations
from posthog.models.event.sql import EVENTS_TABLE_SQL


class Migration(migrations.Migration):
    dependencies = [
        ("posthog", "0022_previous_migration"),
    ]

    operations = [
        migrations.RunSQL("ALTER TABLE events ADD COLUMN IF NOT EXISTS my_column String DEFAULT ''"),
    ]
```

## Common Operation Types

### Adding a Column

Always use `IF NOT EXISTS` to make migrations idempotent:

```python
operations = [
    migrations.RunSQL(
        "ALTER TABLE sharded_events ON CLUSTER '{cluster}' "
        "ADD COLUMN IF NOT EXISTS new_column String DEFAULT ''"
    ),
    migrations.RunSQL(
        "ALTER TABLE events ON CLUSTER '{cluster}' "
        "ADD COLUMN IF NOT EXISTS new_column String DEFAULT ''"
    ),
]
```

### Dropping a Column

```python
operations = [
    migrations.RunSQL(
        "ALTER TABLE sharded_events ON CLUSTER '{cluster}' "
        "DROP COLUMN IF EXISTS old_column"
    ),
    migrations.RunSQL(
        "ALTER TABLE events ON CLUSTER '{cluster}' "
        "DROP COLUMN IF EXISTS old_column"
    ),
]
```

### Creating a New Table

```python
NEW_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS {table_name} ON CLUSTER '{cluster}'
(
    id UUID,
    created_at DateTime64(6, 'UTC'),
    team_id Int64,
    data String
)
ENGINE = {engine}
PARTITION BY toYYYYMM(created_at)
ORDER BY (team_id, created_at, id)
"""

operations = [
    migrations.RunSQL(NEW_TABLE_SQL.format(
        table_name="my_new_table",
        cluster="{cluster}",
        engine="ReplacingMergeTree()",
    )),
]
```

### Adding a Materialized View

```python
MATERIALIZED_VIEW_SQL = """
CREATE MATERIALIZED VIEW IF NOT EXISTS my_mv_table
TO my_destination_table
AS SELECT
    id,
    team_id,
    created_at
FROM my_source_table
"""

operations = [
    migrations.RunSQL(MATERIALIZED_VIEW_SQL),
]
```

## Cluster-Aware Migrations

For distributed ClickHouse setups, always include `ON CLUSTER '{cluster}'`:

```python
from posthog.settings import CLICKHOUSE_CLUSTER

operations = [
    migrations.RunSQL(
        f"ALTER TABLE events ON CLUSTER '{CLICKHOUSE_CLUSTER}' "
        "ADD COLUMN IF NOT EXISTS my_column UInt8 DEFAULT 0"
    ),
]
```

## Handling Replicated Tables

When modifying both the sharded and distributed tables:

1. Always modify `sharded_{table}` first
2. Then modify the distributed `{table}` view

```python
operations = [
    # Modify the underlying sharded table first
    migrations.RunSQL(
        "ALTER TABLE sharded_events ON CLUSTER '{cluster}' "
        "ADD COLUMN IF NOT EXISTS my_column String DEFAULT ''"
    ),
    # Then update the distributed table
    migrations.RunSQL(
        "ALTER TABLE events ON CLUSTER '{cluster}' "
        "ADD COLUMN IF NOT EXISTS my_column String DEFAULT ''"
    ),
]
```

## Testing Migrations

Migrations can be tested locally with:

```bash
python manage.py migrate_clickhouse
```

To check pending migrations:

```bash
python manage.py migrate_clickhouse --check
```

## Common Pitfalls

1. **Missing `IF NOT EXISTS` / `IF EXISTS`**: Always include these to ensure idempotency.
2. **Forgetting the cluster clause**: In production, ClickHouse runs as a cluster.
3. **Column type mismatches**: Ensure column types match between sharded and distributed tables.
4. **Order of operations**: Some operations (like adding a column used in a materialized view) must be done in the correct order.
5. **Large table alterations**: For very large tables, consider using `ALTER TABLE ... UPDATE` carefully as it can be expensive.
