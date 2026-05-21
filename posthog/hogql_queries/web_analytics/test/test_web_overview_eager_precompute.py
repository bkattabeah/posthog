"""Tests for the eager (Dagster-driven) pre-warming of web_overview_preaggregated.

The eager path has no separate query logic — the Dagster job calls ensure_precomputed
for the common parameter combinations, and the existing lazy path (execute_lazy_precomputed_read
via ensure_precomputed) finds READY jobs and returns without INSERTs.
"""

from datetime import UTC, datetime

from freezegun import freeze_time
from posthog.test.base import APIBaseTest, ClickhouseTestMixin, _create_event, _create_person, flush_persons_and_events

from django.test import override_settings

from dagster import build_op_context
from parameterized import parameterized

from posthog.schema import (
    CompareFilter,
    DateRange,
    EventPropertyFilter,
    HogQLQueryModifiers,
    PropertyOperator,
    SessionsV2JoinMode,
    WebAnalyticsSampling,
    WebOverviewQuery,
)

from posthog.hogql import ast
from posthog.hogql.parser import parse_select

from posthog.clickhouse.client import sync_execute
from posthog.clickhouse.preaggregation.web_overview_preaggregated_sql import (
    TRUNCATE_WEB_OVERVIEW_PREAGGREGATED_TABLE_SQL,
)
from posthog.hogql_queries.web_analytics.web_overview import WebOverviewQueryRunner
from posthog.hogql_queries.web_analytics.web_overview_lazy_precompute import (
    INSERT_QUERY_TEMPLATE,
    _build_placeholders,
    can_use_eager_precompute,
    can_use_lazy_precompute,
    can_use_precomputed_path,
)
from posthog.models.instance_setting import override_instance_config
from posthog.models.utils import uuid7

from products.analytics_platform.backend.lazy_computation.lazy_computation_executor import (
    LazyComputationTable,
    QueryInfo,
    compute_query_hash,
)
from products.analytics_platform.backend.models.preaggregation_job import PreaggregationJob
from products.web_analytics.dags.eager_web_overview_precompute import (
    _build_dag_placeholders,
    _standard_date_ranges,
    warm_eager_precompute_op,
)


@override_settings(IN_UNIT_TESTING=True)
class TestWebOverviewEagerPrecompute(ClickhouseTestMixin, APIBaseTest):
    def setUp(self) -> None:
        super().setUp()
        PreaggregationJob.objects.filter(team_id=self.team.pk).delete()
        sync_execute(TRUNCATE_WEB_OVERVIEW_PREAGGREGATED_TABLE_SQL())

    def _enable_eager(self):
        return override_instance_config("WEB_ANALYTICS_EAGER_PRECOMPUTE_TEAM_IDS", [self.team.pk])

    def _enable_lazy(self):
        return override_instance_config("WEB_ANALYTICS_LAZY_PRECOMPUTE_TEAM_IDS", [self.team.pk])

    def _seed_two_sessions(self) -> None:
        s1 = str(uuid7("2024-01-02"))
        s2 = str(uuid7("2024-01-03"))
        _create_person(team_id=self.team.pk, distinct_ids=["p1"], properties={"name": "p1"})
        _create_person(team_id=self.team.pk, distinct_ids=["p2"], properties={"name": "p2"})
        _create_event(
            team=self.team,
            event="$pageview",
            distinct_id="p1",
            timestamp="2024-01-02T10:00:00Z",
            properties={"$session_id": s1, "$host": "example.com"},
        )
        _create_event(
            team=self.team,
            event="$pageview",
            distinct_id="p1",
            timestamp="2024-01-02T10:05:00Z",
            properties={"$session_id": s1, "$host": "example.com"},
        )
        _create_event(
            team=self.team,
            event="$pageview",
            distinct_id="p2",
            timestamp="2024-01-03T11:00:00Z",
            properties={"$session_id": s2, "$host": "other.com"},
        )
        flush_persons_and_events()

    def _build_query(
        self,
        date_from: str = "2024-01-01",
        date_to: str = "2024-01-07",
        properties: list | None = None,
        compare: bool = False,
        opt_in_lazy: bool = True,
    ) -> WebOverviewQuery:
        return WebOverviewQuery(
            dateRange=DateRange(date_from=date_from, date_to=date_to),
            properties=properties or [],
            compareFilter=CompareFilter(compare=compare) if compare else None,
            useWebAnalyticsPrecompute=opt_in_lazy,
        )

    def _runner(self, query: WebOverviewQuery) -> WebOverviewQueryRunner:
        return WebOverviewQueryRunner(team=self.team, query=query)

    # ─── gate logic ──────────────────────────────────────────────────────────

    def test_disabled_team_cannot_use_eager_precompute(self):
        runner = self._runner(self._build_query())
        assert not can_use_eager_precompute(runner)

    @freeze_time("2040-01-15T12:00:00Z")
    def test_enabled_team_can_use_eager_precompute(self):
        runner = self._runner(self._build_query())
        with self._enable_eager():
            assert can_use_eager_precompute(runner)

    def test_eager_and_lazy_gates_are_independent(self):
        runner = self._runner(self._build_query())
        with self._enable_eager():
            assert can_use_eager_precompute(runner)
            assert not can_use_lazy_precompute(runner)

        with self._enable_lazy():
            assert not can_use_eager_precompute(runner)
            assert can_use_lazy_precompute(runner)

    @parameterized.expand(
        [
            ("half_hour_tz", "Asia/Kolkata"),
            ("half_hour_tz_np", "Asia/Kathmandu"),
        ]
    )
    def test_half_hour_timezone_gated_out(self, _name: str, tz: str):
        self.team.timezone = tz
        self.team.save()
        runner = self._runner(self._build_query())
        with self._enable_eager():
            assert not can_use_precomputed_path(runner)

    def test_conversion_goal_gated_out(self):
        from posthog.schema import ActionConversionGoal

        query = WebOverviewQuery(
            dateRange=DateRange(date_from="2024-01-01", date_to="2024-01-07"),
            properties=[],
            conversionGoal=ActionConversionGoal(actionId=1),
        )
        runner = self._runner(query)
        with self._enable_eager():
            assert not can_use_precomputed_path(runner)

    def test_sampling_gated_out(self):
        query = WebOverviewQuery(
            dateRange=DateRange(date_from="2024-01-01", date_to="2024-01-07"),
            properties=[],
            sampling=WebAnalyticsSampling(enabled=True),
        )
        runner = self._runner(query)
        with self._enable_eager():
            assert not can_use_precomputed_path(runner)

    def test_sessions_v2_uuid_mode_gated_out(self):
        query = WebOverviewQuery(
            dateRange=DateRange(date_from="2024-01-01", date_to="2024-01-07"),
            properties=[],
            modifiers=HogQLQueryModifiers(sessionsV2JoinMode=SessionsV2JoinMode.UUID),
        )
        runner = self._runner(query)
        with self._enable_eager():
            assert not can_use_precomputed_path(runner)

    def test_multi_property_filter_gated_out(self):
        query = WebOverviewQuery(
            dateRange=DateRange(date_from="2024-01-01", date_to="2024-01-07"),
            properties=[
                EventPropertyFilter(key="$host", value="a.com", operator=PropertyOperator.EXACT),
                EventPropertyFilter(key="$host", value="b.com", operator=PropertyOperator.EXACT),
            ],
        )
        runner = self._runner(query)
        with self._enable_eager():
            assert not can_use_precomputed_path(runner)

    def test_unsupported_property_key_gated_out(self):
        query = WebOverviewQuery(
            dateRange=DateRange(date_from="2024-01-01", date_to="2024-01-07"),
            properties=[
                EventPropertyFilter(key="$browser", value="Chrome", operator=PropertyOperator.EXACT),
            ],
        )
        runner = self._runner(query)
        with self._enable_eager():
            assert not can_use_precomputed_path(runner)

    def test_non_exact_host_filter_gated_out(self):
        query = WebOverviewQuery(
            dateRange=DateRange(date_from="2024-01-01", date_to="2024-01-07"),
            properties=[
                EventPropertyFilter(key="$host", value="example.com", operator=PropertyOperator.ICONTAINS),
            ],
        )
        runner = self._runner(query)
        with self._enable_eager():
            assert not can_use_precomputed_path(runner)

    def test_too_many_days_gated_out(self):
        query = WebOverviewQuery(
            dateRange=DateRange(date_from="2023-01-01", date_to="2024-01-15"),
            properties=[],
        )
        runner = self._runner(query)
        with self._enable_eager():
            assert not can_use_precomputed_path(runner)

    # ─── eager uses the lazy path (ensure_precomputed handles cache hits) ────

    @freeze_time("2040-01-15T12:00:00Z")
    def test_eager_team_triggers_lazy_insert_on_miss(self):
        """When no pre-warmed jobs exist, the eager path falls through to ensure_precomputed."""
        self._seed_two_sessions()
        runner = self._runner(self._build_query())

        with self._enable_eager():
            row = runner.get_precomputed_row()

        assert row is not None
        assert row[0] > 0

    @freeze_time("2040-01-15T12:00:00Z")
    def test_eager_team_creates_job_on_first_request(self):
        self._seed_two_sessions()
        with self._enable_eager():
            WebOverviewQueryRunner(team=self.team, query=self._build_query()).calculate()

        jobs = list(PreaggregationJob.objects.filter(team_id=self.team.pk))
        assert len(jobs) > 0

    @freeze_time("2040-01-15T12:00:00Z")
    def test_pre_warmed_data_is_found_without_new_insert(self):
        """After warm_eager_precompute_op runs, the lazy path hits the cache (no new jobs)."""
        self._seed_two_sessions()

        with self._enable_lazy():
            WebOverviewQueryRunner(team=self.team, query=self._build_query()).calculate()

        job_count_before = PreaggregationJob.objects.filter(team_id=self.team.pk).count()

        with self._enable_eager():
            WebOverviewQueryRunner(team=self.team, query=self._build_query()).calculate()

        job_count_after = PreaggregationJob.objects.filter(team_id=self.team.pk).count()
        assert job_count_after == job_count_before

    @freeze_time("2040-01-15T12:00:00Z")
    def test_eager_result_matches_raw_result(self):
        self._seed_two_sessions()

        with self._enable_lazy():
            WebOverviewQueryRunner(team=self.team, query=self._build_query()).calculate()

        raw_response = WebOverviewQueryRunner(team=self.team, query=self._build_query()).calculate()
        raw_visitors = raw_response.results[0].value

        with self._enable_eager():
            eager_response = WebOverviewQueryRunner(team=self.team, query=self._build_query()).calculate()
        eager_visitors = eager_response.results[0].value

        assert abs(eager_visitors - raw_visitors) <= 1

    @freeze_time("2040-01-15T12:00:00Z")
    def test_eager_compare_period_returns_results(self):
        self._seed_two_sessions()

        with self._enable_lazy():
            WebOverviewQueryRunner(team=self.team, query=self._build_query(compare=True)).calculate()

        with self._enable_eager():
            response = WebOverviewQueryRunner(team=self.team, query=self._build_query(compare=True)).calculate()

        assert response.results is not None
        assert len(response.results) == 5

    # ─── disabled team fallthrough ────────────────────────────────────────────

    @freeze_time("2040-01-15T12:00:00Z")
    def test_disabled_team_uses_raw_path(self):
        self._seed_two_sessions()
        response = WebOverviewQueryRunner(team=self.team, query=self._build_query()).calculate()
        assert response.results is not None
        assert len(response.results) == 5

    # ─── hash parity: DAG placeholders must match query-path placeholders ────

    def _compute_hash(self, placeholders: dict) -> str:
        hash_placeholders = {
            **placeholders,
            "time_window_min": ast.Constant(value="__TIME_WINDOW_MIN__"),
            "time_window_max": ast.Constant(value="__TIME_WINDOW_MAX__"),
        }
        parsed = parse_select(INSERT_QUERY_TEMPLATE, placeholders=hash_placeholders)
        assert isinstance(parsed, ast.SelectQuery)
        query_info = QueryInfo(
            query=parsed,
            table=LazyComputationTable.WEB_OVERVIEW_PREAGGREGATED,
            timezone=self.team.timezone,
        )
        return compute_query_hash(query_info)

    @freeze_time("2040-01-15T12:00:00Z")
    def test_dag_placeholder_hash_matches_query_path_unfiltered(self):
        """DAG and query-path produce identical cache keys for the unfiltered case."""
        runner = WebOverviewQueryRunner(team=self.team, query=self._build_query())

        query_path_hash = self._compute_hash(_build_placeholders(runner))
        dag_hash = self._compute_hash(_build_dag_placeholders(self.team, host_filter=None, test_account_filter=None))

        assert query_path_hash == dag_hash, (
            "DAG placeholder AST does not match query-path AST — "
            "pre-warmed jobs will not be found by the lazy path cache lookup"
        )

    @freeze_time("2040-01-15T12:00:00Z")
    def test_dag_placeholder_hash_matches_query_path_with_host_filter(self):
        host_query = self._build_query(
            properties=[EventPropertyFilter(key="$host", value="example.com", operator=PropertyOperator.EXACT)]
        )
        runner = WebOverviewQueryRunner(team=self.team, query=host_query)

        query_path_hash = self._compute_hash(_build_placeholders(runner))
        dag_hash = self._compute_hash(
            _build_dag_placeholders(self.team, host_filter="example.com", test_account_filter=None)
        )

        assert query_path_hash == dag_hash

    @freeze_time("2040-01-15T12:00:00Z")
    def test_dag_placeholder_host_filter_differs_from_unfiltered(self):
        dag_hash_none = self._compute_hash(_build_dag_placeholders(self.team, host_filter=None))
        dag_hash_example = self._compute_hash(_build_dag_placeholders(self.team, host_filter="example.com"))
        dag_hash_other = self._compute_hash(_build_dag_placeholders(self.team, host_filter="other.com"))

        assert dag_hash_none != dag_hash_example
        assert dag_hash_example != dag_hash_other

    # ─── standard date ranges coverage ───────────────────────────────────────

    @freeze_time("2024-01-15T12:00:00Z")
    def test_standard_date_ranges_are_five_ranges(self):
        now_utc = datetime.now(UTC)
        assert len(_standard_date_ranges(now_utc)) == 5

    @freeze_time("2024-01-15T12:00:00Z")
    def test_standard_date_ranges_today_is_correct(self):
        now_utc = datetime.now(UTC)
        ranges = _standard_date_ranges(now_utc)
        today_start = datetime(2024, 1, 15, tzinfo=UTC)
        today_end = datetime(2024, 1, 16, tzinfo=UTC)
        assert ranges[0] == (today_start, today_end)

    @freeze_time("2024-01-15T12:00:00Z")
    def test_standard_date_ranges_covers_7d_query(self):
        now_utc = datetime.now(UTC)
        ranges = _standard_date_ranges(now_utc)
        query_start = datetime(2024, 1, 8, tzinfo=UTC)
        query_end = datetime(2024, 1, 16, tzinfo=UTC)
        covered = any(r_start <= query_start and r_end >= query_end for r_start, r_end in ranges)
        assert covered, f"No standard range covers [{query_start}, {query_end}). Ranges: {ranges}"

    # ─── warm_eager_precompute_op e2e ─────────────────────────────────────────

    @freeze_time("2024-01-15T12:00:00Z")
    def test_warm_op_prewarms_and_lazy_path_hits_cache(self):
        """warm_eager_precompute_op writes READY jobs; subsequent lazy-path call hits cache without new INSERT."""
        self._seed_two_sessions()
        mock_context = build_op_context()

        with self._enable_eager():
            warm_eager_precompute_op(mock_context, [self.team.pk])

        job_count_before = PreaggregationJob.objects.filter(team_id=self.team.pk).count()

        with self._enable_eager():
            WebOverviewQueryRunner(team=self.team, query=self._build_query()).calculate()

        job_count_after = PreaggregationJob.objects.filter(team_id=self.team.pk).count()
        assert job_count_after == job_count_before, "Cache hit should not create new jobs"

    @freeze_time("2024-01-15T12:00:00Z")
    def test_warm_op_creates_ready_jobs(self):
        self._seed_two_sessions()
        mock_context = build_op_context()

        with self._enable_eager():
            warm_eager_precompute_op(mock_context, [self.team.pk])

        jobs = list(PreaggregationJob.objects.filter(team_id=self.team.pk, status=PreaggregationJob.Status.READY))
        assert len(jobs) > 0

    @freeze_time("2024-01-15T12:00:00Z")
    def test_warm_op_skips_nonexistent_team(self):
        mock_context = build_op_context()
        warm_eager_precompute_op(mock_context, [999_999_999])

    @freeze_time("2024-01-15T12:00:00Z")
    def test_warm_op_idempotent_second_run_reuses_jobs(self):
        self._seed_two_sessions()
        mock_context = build_op_context()

        with self._enable_eager():
            warm_eager_precompute_op(mock_context, [self.team.pk])
            count_after_first = PreaggregationJob.objects.filter(team_id=self.team.pk).count()
            warm_eager_precompute_op(mock_context, [self.team.pk])
            count_after_second = PreaggregationJob.objects.filter(team_id=self.team.pk).count()

        assert count_after_second == count_after_first
