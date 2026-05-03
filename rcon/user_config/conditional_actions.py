import logging
import re
from enum import Enum
from typing import Any, TypedDict

from pydantic import BaseModel, Field, field_validator

from rcon.user_config.utils import BaseUserConfig, _listType, key_check, set_user_config

logger = logging.getLogger(__name__)


class TriggerEvent(str, Enum):
    PLAYER_CONNECTED = "player_connected"
    PLAYER_DISCONNECTED = "player_disconnected"
    PLAYER_KILL = "player_kill"
    PLAYER_DEATH = "player_death"
    PLAYER_TEAM_KILL = "player_team_kill"
    PLAYER_CHAT = "player_chat"
    MATCH_START = "match_start"
    MATCH_END = "match_end"
    PERIODIC = "periodic"


class ConditionField(str, Enum):
    ALWAYS_TRUE = "always_true"
    PLAYER_NAME = "player_name"
    PLAYER_ID = "player_id"
    PLAYER_LEVEL = "player_level"
    KILLS = "kills"
    DEATHS = "deaths"
    KILL_DEATH_RATIO = "kill_death_ratio"
    TEAMKILLS = "teamkills"
    COMBAT_SCORE = "combat"
    OFFENSE_SCORE = "offense"
    DEFENSE_SCORE = "defense"
    SUPPORT_SCORE = "support"
    KILLS_PER_MINUTE = "kills_per_minute"
    DEATHS_PER_MINUTE = "deaths_per_minute"
    KILL_STREAK = "kills_streak"
    PLAYTIME_SECONDS = "time_seconds"
    IS_VIP = "is_vip"
    TOTAL_PLAYTIME_SECONDS = "total_playtime_seconds"
    SESSIONS_COUNT = "sessions_count"
    PENALTY_COUNT = "penalty_count"
    SERVER_PLAYER_COUNT = "server_player_count"
    TEAM_PLAYER_COUNT = "team_player_count"
    MAP_NAME = "map_name"
    MATCH_TIME_REMAINING = "match_time_remaining"
    MESSAGE_CONTENT = "message_content"
    MESSAGE_SCOPE = "message_scope"


class ComparisonOperator(str, Enum):
    EQUAL = "equal"
    NOT_EQUAL = "not_equal"
    GREATER_THAN = "greater_than"
    GREATER_THAN_OR_EQUAL = "greater_than_or_equal"
    LESS_THAN = "less_than"
    LESS_THAN_OR_EQUAL = "less_than_or_equal"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    STARTS_WITH = "starts_with"
    ENDS_WITH = "ends_with"
    REGEX_MATCH = "regex_match"


class LogicalOperator(str, Enum):
    AND = "and"
    OR = "or"
    NAND = "nand"
    NOR = "nor"


class ActionType(str, Enum):
    MESSAGE_PLAYER = "message_player"
    MESSAGE_ALL_PLAYERS = "message_all_players"
    KICK_PLAYER = "kick_player"
    PUNISH_PLAYER = "punish_player"
    TEMP_BAN_PLAYER = "temp_ban_player"
    PERMA_BAN_PLAYER = "perma_ban_player"
    ADD_PLAYER_FLAG = "add_player_flag"
    REMOVE_PLAYER_FLAG = "remove_player_flag"
    ADD_TO_WATCHLIST = "add_to_watchlist"
    BROADCAST_MESSAGE = "broadcast_message"
    TEMPORARY_BROADCAST = "temporary_broadcast"
    SEND_DISCORD_WEBHOOK = "send_discord_webhook"
    SWITCH_PLAYER_TEAM = "switch_player_team"
    BROADCAST_MATCH_SUMMARY = "broadcast_match_summary"
    BROADCAST_ROLE_LEADERBOARD = "broadcast_role_leaderboard"
    BROADCAST_SQUAD_LEADERBOARD = "broadcast_squad_leaderboard"
    BROADCAST_SEASONAL_LEADERBOARD = "broadcast_seasonal_leaderboard"


class Condition(BaseModel):
    field: ConditionField = Field(title="Field", description="The field to check")
    operator: ComparisonOperator = Field(title="Operator", description="How to compare")
    value: str | int | float | bool = Field(title="Value", description="The value to compare against")

    @field_validator("value")
    @classmethod
    def validate_value_type(cls, v, info):
        operator = info.data.get("operator")
        if operator == ComparisonOperator.REGEX_MATCH and isinstance(v, str):
            try:
                re.compile(v)
            except re.error as e:
                raise ValueError(f"Invalid regex pattern: {e}")
        return v


class Action(BaseModel):
    action_type: ActionType = Field(title="Action Type", description="Type of action to execute")
    parameters: dict[str, Any] = Field(
        default_factory=dict,
        title="Parameters",
        description="Action-specific parameters (e.g., message text, ban duration)",
    )

    @field_validator("parameters")
    @classmethod
    def validate_parameters(cls, v, info):
        action_type = info.data.get("action_type")

        if not action_type:
            return v

        required_params = {
            ActionType.MESSAGE_PLAYER: ["message"],
            ActionType.MESSAGE_ALL_PLAYERS: ["message"],
            ActionType.KICK_PLAYER: ["reason"],
            ActionType.PUNISH_PLAYER: ["reason"],
            ActionType.TEMP_BAN_PLAYER: ["reason", "duration_hours"],
            ActionType.PERMA_BAN_PLAYER: ["reason"],
            ActionType.ADD_PLAYER_FLAG: ["flag"],
            ActionType.REMOVE_PLAYER_FLAG: ["flag"],
            ActionType.ADD_TO_WATCHLIST: ["reason"],
            ActionType.BROADCAST_MESSAGE: ["message"],
            ActionType.TEMPORARY_BROADCAST: ["message", "duration_seconds"],
            ActionType.SEND_DISCORD_WEBHOOK: ["webhook_url", "message"],
        }

        if action_type in required_params:
            missing = set(required_params[action_type]) - set(v.keys())
            if missing:
                raise ValueError(
                    f"Action {action_type.value} requires parameters: {missing}"
                )

        return v


class ConditionalRule(BaseModel):
    id: str = Field(title="ID", description="Unique identifier for this rule")
    name: str = Field(title="Name", description="Human-readable name for this rule")
    description: str = Field(default="", title="Description", description="Optional description")
    priority: int = Field(
        default=0,
        ge=0,
        title="Priority",
        description="Higher priority rules execute first (0 = default)",
    )
    enabled: bool = Field(default=True, title="Enabled", description="Whether this rule is active")
    trigger_event: TriggerEvent = Field(title="Trigger Event", description="When to evaluate this rule")
    trigger_interval_seconds: int = Field(
        default=60,
        ge=10,
        title="Trigger Interval",
        description="For PERIODIC triggers, how often to check (min 10 seconds)",
    )

    logical_operator: LogicalOperator = Field(
        default=LogicalOperator.AND,
        title="Logical Operator",
        description="How to combine conditions",
    )
    conditions: list[Condition] = Field(
        min_length=1,
        title="Conditions",
        description="List of conditions to check",
    )

    actions: list[Action] = Field(
        min_length=1,
        title="Actions",
        description="Actions to execute when conditions are met",
    )

    cooldown_seconds: int = Field(
        default=0,
        ge=0,
        title="Cooldown",
        description="Minimum seconds between executions for the same player (0 = no cooldown)",
    )

    max_executions_per_player: int = Field(
        default=0,
        ge=0,
        title="Max Executions",
        description="Max times this rule can execute per player per session (0 = unlimited)",
    )


class ConditionType(TypedDict):
    field: str
    operator: str
    value: str | int | float | bool


class ActionTypeDict(TypedDict):
    action_type: str
    parameters: dict[str, Any]


class ConditionalRuleType(TypedDict):
    id: str
    name: str
    description: str
    priority: int
    enabled: bool
    trigger_event: str
    trigger_interval_seconds: int
    logical_operator: str
    conditions: list[ConditionType]
    actions: list[ActionTypeDict]
    cooldown_seconds: int
    max_executions_per_player: int


class ConditionalActionsType(TypedDict):
    enabled: bool
    rules: list[ConditionalRuleType]


class ConditionalActionsUserConfig(BaseUserConfig):
    enabled: bool = Field(
        default=False,
        strict=True,
        title="Enable",
        description="Master switch for conditional actions system",
    )
    rules: list[ConditionalRule] = Field(
        default_factory=list,
        title="Rules",
        description="List of conditional rules",
    )

    @field_validator("rules")
    @classmethod
    def validate_unique_ids(cls, v):
        ids = [rule.id for rule in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Rule IDs must be unique")
        return v

    @staticmethod
    def save_to_db(values: ConditionalActionsType, dry_run=False):
        key_check(
            ConditionalActionsType.__required_keys__,
            ConditionalActionsType.__optional_keys__,
            values.keys(),
        )

        enabled = values.get("enabled")
        raw_rules = values.get("rules", [])
        _listType(values=raw_rules)

        validated_rules = []
        for raw_rule in raw_rules:
            conditions = [
                Condition(**cond) for cond in raw_rule.get("conditions", [])
            ]

            actions = [
                Action(**act) for act in raw_rule.get("actions", [])
            ]

            rule = ConditionalRule(
                id=raw_rule.get("id"),
                name=raw_rule.get("name"),
                description=raw_rule.get("description", ""),
                priority=raw_rule.get("priority", 0),
                enabled=raw_rule.get("enabled", True),
                trigger_event=TriggerEvent(raw_rule.get("trigger_event")),
                trigger_interval_seconds=raw_rule.get("trigger_interval_seconds", 60),
                logical_operator=LogicalOperator(raw_rule.get("logical_operator", "and")),
                conditions=conditions,
                actions=actions,
                cooldown_seconds=raw_rule.get("cooldown_seconds", 0),
                max_executions_per_player=raw_rule.get("max_executions_per_player", 0),
            )
            validated_rules.append(rule)

        validated_conf = ConditionalActionsUserConfig(
            enabled=enabled,
            rules=validated_rules,
        )

        if not dry_run:
            # Detect removed/renamed rules and clean up their Redis state
            try:
                old_conf = ConditionalActionsUserConfig.load_from_db()
                new_rule_ids = {r.id for r in validated_rules}
                new_rule_names = {r.name for r in validated_rules}
                removed_ids = [r.id for r in old_conf.rules if r.id not in new_rule_ids]
                removed_names = [r.name for r in old_conf.rules if r.name not in new_rule_names]
                if removed_ids or removed_names:
                    _cleanup_rule_redis_state(removed_ids, removed_names)
            except Exception as e:
                logger.warning("Failed to clean up Redis state for removed rules: %s", e)

            set_user_config(validated_conf.KEY(), validated_conf)


def _cleanup_rule_redis_state(rule_ids: list[str], rule_names: list[str]) -> None:
    """Delete Redis keys belonging to removed/renamed conditional action rules."""
    try:
        from rcon.cache_utils import get_redis_client
    except Exception:
        return

    red = get_redis_client()
    patterns = []
    for rule_id in rule_ids:
        patterns.extend([
            f"conditional_action:last_exec:{rule_id}:*",
            f"conditional_action:executions:{rule_id}:*",
            f"conditional_action:periodic:{rule_id}",
        ])
    for rule_name in rule_names:
        patterns.extend([
            f"conditional_action:season:{rule_name}:*",
            f"conditional_action:match_summary:{rule_name}",
            f"conditional_action:role_leaderboard:{rule_name}",
            f"conditional_action:squad_leaderboard:{rule_name}",
            f"conditional_action:seasonal:{rule_name}",
        ])

    deleted = 0
    for pattern in patterns:
        if "*" in pattern:
            keys = list(red.scan_iter(match=pattern, count=500))
            if keys:
                deleted += red.delete(*keys)
        else:
            deleted += red.delete(pattern)

    if deleted:
        logger.info(
            "Cleaned up %d Redis keys for removed/renamed conditional rules (ids=%s, names=%s)",
            deleted, rule_ids, rule_names,
        )
