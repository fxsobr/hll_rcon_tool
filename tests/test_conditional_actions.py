"""Unit tests for the conditional actions processor.

Covers:
- Condition field resolution
- Comparison operator evaluation (including boolean normalization)
- Logical operator combination (AND/OR/NAND/NOR)
- Template variable substitution
- Rate limiting (cooldown + max executions)
- Rule filtering by trigger event
"""
from unittest.mock import MagicMock

import pytest

from rcon.conditional_actions.processor import ConditionalActionsProcessor
from rcon.user_config.conditional_actions import (
    Action,
    ActionType,
    ComparisonOperator,
    Condition,
    ConditionField,
    ConditionalRule,
    LogicalOperator,
    TriggerEvent,
)


@pytest.fixture
def mock_rcon():
    """An Rcon stub with only the methods the processor might call."""
    rcon = MagicMock()
    rcon.get_detailed_players.return_value = {"players": {}}
    rcon.get_gamestate.return_value = {
        "num_allied_players": 20,
        "num_axis_players": 18,
        "current_map": {"map": {"pretty_name": "Sainte-Marie-du-Mont"}},
        "raw_time_remaining": "1:30:00",
    }
    return rcon


@pytest.fixture
def mock_redis():
    """In-memory fake Redis with the subset of commands the processor uses."""
    store = {}

    def _get(key):
        return store.get(key)

    def _set(key, value, ex=None, nx=False):
        if nx and key in store:
            return False
        store[key] = value.encode() if isinstance(value, str) else value
        return True

    def _incr(key):
        current = int(store.get(key, b"0").decode())
        store[key] = str(current + 1).encode()
        return current + 1

    def _expire(key, ttl):
        return True

    redis = MagicMock()
    redis.get.side_effect = _get
    redis.set.side_effect = _set
    redis.incr.side_effect = _incr
    redis.expire.side_effect = _expire
    redis._store = store
    return redis


@pytest.fixture
def processor(mock_rcon, mock_redis, monkeypatch):
    """ConditionalActionsProcessor wired to the fake rcon and redis."""
    monkeypatch.setattr(
        "rcon.conditional_actions.processor.get_redis_client",
        lambda: mock_redis,
    )
    return ConditionalActionsProcessor(mock_rcon)


@pytest.fixture
def sample_player():
    return {
        "name": "TestPlayer",
        "player_id": "76561198000000001",
        "level": 150,
        "is_vip": True,
        "kills": 20,
        "deaths": 5,
        "team_kills": 0,
        "combat": 500,
        "offense": 300,
        "defense": 200,
        "support": 100,
        "map_playtime_seconds": 600,
        "role": "officer",
        "team": "allies",
        "unit_name": "Able",
    }


@pytest.fixture
def sample_gamestate():
    return {
        "num_allied_players": 20,
        "num_axis_players": 18,
        "current_map": {"map": {"pretty_name": "Sainte-Marie-du-Mont"}},
        "raw_time_remaining": "1:30:00",
    }


# ---------- Field resolution ----------

class TestGetFieldValue:
    def test_always_true(self, processor):
        assert processor._get_field_value(ConditionField.ALWAYS_TRUE, "id") is True

    def test_simple_player_fields(self, processor, sample_player):
        assert processor._get_field_value(
            ConditionField.PLAYER_NAME, "id", sample_player
        ) == "TestPlayer"
        assert processor._get_field_value(
            ConditionField.PLAYER_LEVEL, "id", sample_player
        ) == 150
        assert processor._get_field_value(
            ConditionField.IS_VIP, "id", sample_player
        ) is True

    def test_player_stats_use_internal_field_names(self, processor, sample_player):
        # TEAMKILLS maps to the actual "team_kills" field (project pattern)
        assert processor._get_field_value(
            ConditionField.TEAMKILLS, "id", sample_player
        ) == 0
        assert processor._get_field_value(
            ConditionField.COMBAT_SCORE, "id", sample_player
        ) == 500

    def test_computed_kd_ratio(self, processor, sample_player):
        # 20 kills / 5 deaths = 4.0
        assert processor._get_field_value(
            ConditionField.KILL_DEATH_RATIO, "id", sample_player
        ) == 4.0

    def test_kd_ratio_with_zero_deaths(self, processor, sample_player):
        sample_player["deaths"] = 0
        # Division by zero falls back to kills
        assert processor._get_field_value(
            ConditionField.KILL_DEATH_RATIO, "id", sample_player
        ) == 20

    def test_kills_per_minute(self, processor, sample_player):
        # 20 kills / (600s / 60) = 2.0 KPM
        assert processor._get_field_value(
            ConditionField.KILLS_PER_MINUTE, "id", sample_player
        ) == 2.0

    def test_kpm_with_zero_playtime(self, processor, sample_player):
        sample_player["map_playtime_seconds"] = 0
        assert processor._get_field_value(
            ConditionField.KILLS_PER_MINUTE, "id", sample_player
        ) == 0.0

    def test_map_name_extracts_pretty_name(self, processor, sample_gamestate):
        assert processor._get_field_value(
            ConditionField.MAP_NAME, "id", gamestate=sample_gamestate
        ) == "Sainte-Marie-du-Mont"

    def test_server_player_count(self, processor, sample_gamestate):
        assert processor._get_field_value(
            ConditionField.SERVER_PLAYER_COUNT, "id", gamestate=sample_gamestate
        ) == 38

    def test_match_time_remaining_parses_hms(self, processor, sample_gamestate):
        # 1:30:00 = 1*3600 + 30*60 = 5400s
        assert processor._get_field_value(
            ConditionField.MATCH_TIME_REMAINING, "id", gamestate=sample_gamestate
        ) == 5400

    def test_team_player_count(self, processor, sample_player, sample_gamestate):
        # player is on allies, allies has 20
        assert processor._get_field_value(
            ConditionField.TEAM_PLAYER_COUNT, "id", sample_player, sample_gamestate
        ) == 20

    def test_message_content_from_context(self, processor):
        ctx = {"message_content": "!rules", "message_scope": "CHAT[All]"}
        assert processor._get_field_value(
            ConditionField.MESSAGE_CONTENT, "id", context=ctx
        ) == "!rules"

    def test_missing_player_info_returns_none(self, processor):
        assert processor._get_field_value(ConditionField.PLAYER_NAME, "id") is None


# ---------- Condition evaluation ----------

class TestEvaluateCondition:
    def test_equal(self, processor, sample_player):
        cond = Condition(
            field=ConditionField.PLAYER_LEVEL,
            operator=ComparisonOperator.EQUAL,
            value=150,
        )
        assert processor._evaluate_condition(cond, "id", sample_player) is True

    def test_greater_than(self, processor, sample_player):
        cond = Condition(
            field=ConditionField.KILLS,
            operator=ComparisonOperator.GREATER_THAN,
            value=10,
        )
        assert processor._evaluate_condition(cond, "id", sample_player) is True

    def test_less_than_false(self, processor, sample_player):
        cond = Condition(
            field=ConditionField.KILLS,
            operator=ComparisonOperator.LESS_THAN,
            value=10,
        )
        assert processor._evaluate_condition(cond, "id", sample_player) is False

    def test_boolean_normalization_true_string(self, processor, sample_player):
        # JSON may send "true" as a string from the UI
        cond = Condition(
            field=ConditionField.IS_VIP,
            operator=ComparisonOperator.EQUAL,
            value="true",
        )
        assert processor._evaluate_condition(cond, "id", sample_player) is True

    def test_boolean_normalization_false_player(self, processor, sample_player):
        sample_player["is_vip"] = False
        cond = Condition(
            field=ConditionField.IS_VIP,
            operator=ComparisonOperator.EQUAL,
            value=True,
        )
        assert processor._evaluate_condition(cond, "id", sample_player) is False

    def test_contains_case_insensitive(self, processor, sample_player):
        cond = Condition(
            field=ConditionField.PLAYER_NAME,
            operator=ComparisonOperator.CONTAINS,
            value="player",  # lowercase, player name is "TestPlayer"
        )
        assert processor._evaluate_condition(cond, "id", sample_player) is True

    def test_regex_match(self, processor, sample_player):
        cond = Condition(
            field=ConditionField.PLAYER_NAME,
            operator=ComparisonOperator.REGEX_MATCH,
            value=r"^Test.*",
        )
        assert processor._evaluate_condition(cond, "id", sample_player) is True

    def test_none_field_fails(self, processor):
        # No player_info → PLAYER_NAME is None → condition fails
        cond = Condition(
            field=ConditionField.PLAYER_NAME,
            operator=ComparisonOperator.EQUAL,
            value="anything",
        )
        assert processor._evaluate_condition(cond, "id") is False


# ---------- Logical operators ----------

class TestLogicalOperators:
    def _make_rule(self, conditions, logical_operator):
        return ConditionalRule(
            id="test",
            name="Test",
            trigger_event=TriggerEvent.PLAYER_CONNECTED,
            logical_operator=logical_operator,
            conditions=conditions,
            actions=[Action(action_type=ActionType.MESSAGE_PLAYER, parameters={"message": "hi"})],
        )

    def test_and_all_true(self, processor, sample_player):
        rule = self._make_rule(
            [
                Condition(field=ConditionField.IS_VIP, operator=ComparisonOperator.EQUAL, value=True),
                Condition(field=ConditionField.KILLS, operator=ComparisonOperator.GREATER_THAN, value=10),
            ],
            LogicalOperator.AND,
        )
        assert processor._evaluate_conditions(rule, "id", sample_player) is True

    def test_and_one_false(self, processor, sample_player):
        rule = self._make_rule(
            [
                Condition(field=ConditionField.IS_VIP, operator=ComparisonOperator.EQUAL, value=True),
                Condition(field=ConditionField.KILLS, operator=ComparisonOperator.GREATER_THAN, value=100),
            ],
            LogicalOperator.AND,
        )
        assert processor._evaluate_conditions(rule, "id", sample_player) is False

    def test_or_one_true(self, processor, sample_player):
        rule = self._make_rule(
            [
                Condition(field=ConditionField.IS_VIP, operator=ComparisonOperator.EQUAL, value=False),
                Condition(field=ConditionField.KILLS, operator=ComparisonOperator.GREATER_THAN, value=10),
            ],
            LogicalOperator.OR,
        )
        assert processor._evaluate_conditions(rule, "id", sample_player) is True

    def test_nand(self, processor, sample_player):
        rule = self._make_rule(
            [
                Condition(field=ConditionField.IS_VIP, operator=ComparisonOperator.EQUAL, value=True),
                Condition(field=ConditionField.KILLS, operator=ComparisonOperator.GREATER_THAN, value=100),
            ],
            LogicalOperator.NAND,
        )
        # VIP=true, kills>100=false → all=false → NAND=true
        assert processor._evaluate_conditions(rule, "id", sample_player) is True

    def test_nor(self, processor, sample_player):
        rule = self._make_rule(
            [
                Condition(field=ConditionField.IS_VIP, operator=ComparisonOperator.EQUAL, value=False),
                Condition(field=ConditionField.KILLS, operator=ComparisonOperator.GREATER_THAN, value=100),
            ],
            LogicalOperator.NOR,
        )
        # Both false → NOR=true
        assert processor._evaluate_conditions(rule, "id", sample_player) is True


# ---------- Template rendering ----------

class TestRenderTemplate:
    def test_basic_variables(self, processor, sample_player, sample_gamestate):
        result = ConditionalActionsProcessor._render_template(
            "Hello {player_name}, you have {kills} kills on {map_name}!",
            "76561198000000001",
            "TestPlayer",
            sample_player,
            sample_gamestate,
        )
        assert result == "Hello TestPlayer, you have 20 kills on Sainte-Marie-du-Mont!"

    def test_missing_player_info_falls_back(self, processor):
        result = ConditionalActionsProcessor._render_template(
            "Hi {player_name}, kills={kills}",
            "id",
            "Someone",
        )
        # Without player_info, {kills} is not substituted
        assert "Someone" in result
        assert "{kills}" in result  # Not replaced since no data

    def test_no_placeholders_returns_unchanged(self, processor):
        result = ConditionalActionsProcessor._render_template(
            "Static message",
            "id",
            "Someone",
        )
        assert result == "Static message"


# ---------- Rate limiting ----------

class TestRateLimiting:
    def test_no_cooldown_always_allows(self, processor):
        rule = ConditionalRule(
            id="r",
            name="R",
            trigger_event=TriggerEvent.PLAYER_CONNECTED,
            cooldown_seconds=0,
            conditions=[Condition(field=ConditionField.ALWAYS_TRUE, operator=ComparisonOperator.EQUAL, value=True)],
            actions=[Action(action_type=ActionType.MESSAGE_PLAYER, parameters={"message": "hi"})],
        )
        assert processor._check_cooldown(rule, "id") is True

    def test_no_execution_limit(self, processor):
        rule = ConditionalRule(
            id="r",
            name="R",
            trigger_event=TriggerEvent.PLAYER_CONNECTED,
            max_executions_per_player=0,
            conditions=[Condition(field=ConditionField.ALWAYS_TRUE, operator=ComparisonOperator.EQUAL, value=True)],
            actions=[Action(action_type=ActionType.MESSAGE_PLAYER, parameters={"message": "hi"})],
        )
        assert processor._check_execution_limit(rule, "id") is True


# ---------- Config validation ----------

class TestRuleValidation:
    def test_unique_rule_ids_required(self):
        from rcon.user_config.conditional_actions import ConditionalActionsUserConfig
        rule_a = ConditionalRule(
            id="dup",
            name="A",
            trigger_event=TriggerEvent.PLAYER_CONNECTED,
            conditions=[Condition(field=ConditionField.ALWAYS_TRUE, operator=ComparisonOperator.EQUAL, value=True)],
            actions=[Action(action_type=ActionType.MESSAGE_PLAYER, parameters={"message": "hi"})],
        )
        rule_b = ConditionalRule(
            id="dup",  # duplicate!
            name="B",
            trigger_event=TriggerEvent.PLAYER_KILL,
            conditions=[Condition(field=ConditionField.ALWAYS_TRUE, operator=ComparisonOperator.EQUAL, value=True)],
            actions=[Action(action_type=ActionType.MESSAGE_PLAYER, parameters={"message": "hi"})],
        )
        with pytest.raises(Exception, match="unique"):
            ConditionalActionsUserConfig(enabled=True, rules=[rule_a, rule_b])

    def test_action_requires_params(self):
        with pytest.raises(Exception):
            # KICK_PLAYER requires 'reason'
            Action(action_type=ActionType.KICK_PLAYER, parameters={})

    def test_temp_ban_requires_duration_hours(self):
        with pytest.raises(Exception):
            Action(
                action_type=ActionType.TEMP_BAN_PLAYER,
                parameters={"reason": "test"},  # missing duration_hours
            )
