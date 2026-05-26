# ClickHouse Migration Examples

This document provides concrete, real-world examples of ClickHouse migrations used in PostHog.

## Example 1: Adding a Column

```python
from posthog.clickhouse.migrations.base import Migration


class Migration(Migration):
    """
    Add a nullable `person_mode` column to the sharded_events table.
    This allows tracking whether an event was processed in person or
    anonymous mode for future person merging logic.
    """

    operations = [
        # Add to the distributed table first so reads work immediately
        """
        ALTER TABLE sharded_events
        ON CLUSTER '{cluster}'
        ADD COLUMN IF NOT EXISTS person_mode LowCardinality(String) DEFAULT 'full'
        """,
        """
        ALTER TABLE events
        ON CLUSTER '{cluster}'
        ADD COLUMN IF NOT EXISTS person_mode LowCardinality(String) DEFAULT 'full'
        """,
    ]
```

## Example 2: Creating a New Table

```python
from posthog.clickhouse.migrations.base import Migration


class Migration(Migration):
    """
    Create the `app_metrics2` table for storing application-level metrics
    such as plugin delivery counts, failures, and retries.
    """

    operations = [
        """
        CREATE TABLE IF NOT EXISTS app_metrics2 ON CLUSTER '{cluster}'
        (
            team_id          Int64,
            timestamp        DateTime64(6, 'UTC'),
            app_source       LowCardinality(String),
            app_source_id    String,
            instance_id      String,
            metric_kind      LowCardinality(String),
            metric_name      LowCardinality(String),
            count            Int64
        )
        ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/{database}/app_metrics2', '{replica}')
        PARTITION BY toYYYYMM(timestamp)
        ORDER BY (team_id, app_source, app_source_id, instance_id, metric_kind, metric_name, timestamp)
        """,
        """
        CREATE TABLE IF NOT EXISTS app_metrics2_mv ON CLUSTER '{cluster}'
        AS app_metrics2
        ENGINE = Distributed('{cluster}', currentDatabase(), app_metrics2, rand())
        """,
    ]
```

## Example 3: Dropping a Column

```python
from posthog.clickhouse.migrations.base import Migration


class Migration(Migration):
    """
    Drop the legacy `is_identified` column from sharded_events.
    This column was deprecated in favour of the `person_mode` column
    and all reads have been migrated.

    IMPORTANT: Verify no queries reference `is_identified` before running.
    """

    operations = [
        """
        ALTER TABLE sharded_events
        ON CLUSTER '{cluster}'
        DROP COLUMN IF EXISTS is_identified
        """,
        """
        ALTER TABLE events
        ON CLUSTER '{cluster}'
        DROP COLUMN IF EXISTS is_identified
        """,
    ]
```

## Example 4: Adding a Materialized Column

```python
from posthog.clickhouse.migrations.base import Migration


class Migration(Migration):
    """
    Add a materialized column `$session_id` extracted from `properties`
    to speed up session-based queries without a full JSON parse at query time.
    """

    operations = [
        """
        ALTER TABLE sharded_events
        ON CLUSTER '{cluster}'
        ADD COLUMN IF NOT EXISTS `$session_id` VARCHAR
        MATERIALIZED trim(BOTH '"' FROM JSONExtractRaw(properties, '$session_id'))
        """,
        """
        ALTER TABLE events
        ON CLUSTER '{cluster}'
        ADD COLUMN IF NOT EXISTS `$session_id` VARCHAR
        MATERIALIZED trim(BOTH '"' FROM JSONExtractRaw(properties, '$session_id'))
        """,
    ]
```

## Common Pitfalls

1. **Always use `IF NOT EXISTS` / `IF EXISTS`** — migrations may be re-run in certain environments.
2. **Apply to both the sharded and distributed tables** — the sharded table holds data; the distributed table is the query entry point.
3. **Use `ON CLUSTER '{cluster}'`** — ensures the DDL is applied to every node in the cluster.
4. **Avoid renaming columns** — ClickHouse rename support is limited; prefer add + backfill + drop.
5. **Test with `DRY_RUN=true`** before applying to production clusters.
