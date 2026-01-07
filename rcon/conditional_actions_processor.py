import logging
import re
from datetime import datetime, timedelta
from typing import Any

from rcon.cache_utils import get_redis_client, ttl_cache
from rcon.player_history import get_player_profile
from rcon.rcon import Rcon, StructuredLogLineWithMetaData
from rcon.types import GetDetailedPlayer, GameStateType
from rcon.user_config.conditional_actions import (
    Action,
    ActionType,
    ComparisonOperator,
    Condition,
    ConditionField,
    ConditionalActionsUserConfig,
    ConditionalRule,
    LogicalOperator,
)
from rcon.workers import temporary_broadcast

logger = logging.getLogger(__name__)


class ConditionalActionsProcessor:
    def __init__(self, rcon: Rcon):
        self.rcon = rcon
        self.redis = get_redis_client()
        
    @staticmethod
    def _get_execution_count_key(rule_id: str, player_id: str) -> str:
        return f"conditional_action:executions:{rule_id}:{player_id}"

    @staticmethod
    def _get_last_execution_key(rule_id: str, player_id: str) -> str:
        return f"conditional_action:last_exec:{rule_id}:{player_id}"
    
    def _check_cooldown(self, rule: ConditionalRule, player_id: str) -> bool:
        if rule.cooldown_seconds == 0:
            return True
            
        last_exec_key = self._get_last_execution_key(rule.id, player_id)
        last_exec = self.redis.get(last_exec_key)
        
        if not last_exec:
            return True
            
        last_exec_time = datetime.fromisoformat(last_exec.decode())
        cooldown_end = last_exec_time + timedelta(seconds=rule.cooldown_seconds)
        
        return datetime.now() > cooldown_end
    
    def _check_execution_limit(self, rule: ConditionalRule, player_id: str) -> bool:
        if rule.max_executions_per_player == 0:
            return True
            
        exec_count_key = self._get_execution_count_key(rule.id, player_id)
        exec_count = self.redis.get(exec_count_key)
        
        if not exec_count:
            return True
            
        return int(exec_count) < rule.max_executions_per_player
    
    def _record_execution(self, rule: ConditionalRule, player_id: str):
        last_exec_key = self._get_last_execution_key(rule.id, player_id)
        self.redis.set(last_exec_key, datetime.now().isoformat(), ex=rule.cooldown_seconds or 3600)
        exec_count_key = self._get_execution_count_key(rule.id, player_id)
        self.redis.incr(exec_count_key)
        self.redis.expire(exec_count_key, 86400)  # 24 hours
    
    @staticmethod
    def _get_field_value(
        field: ConditionField,
        player_id: str,
        player_info: GetDetailedPlayer | None = None,
        gamestate: GameStateType | None = None,
    ) -> Any:
        # Special field that always returns True
        if field == ConditionField.ALWAYS_TRUE:
            return True

        simple_player_fields = {
            ConditionField.PLAYER_NAME: lambda: player_info["name"] if player_info else None,
            ConditionField.PLAYER_ID: lambda: player_id,
            ConditionField.PLAYER_LEVEL: lambda: player_info.get("level") if player_info else None,
            ConditionField.IS_VIP: lambda: player_info.get("is_vip", False) if player_info else False,
        }

        player_stats_fields = {
            ConditionField.KILLS: "kills",
            ConditionField.DEATHS: "deaths",
            ConditionField.TEAMKILLS: "teamkills",
            ConditionField.COMBAT_SCORE: "combat",
            ConditionField.OFFENSE_SCORE: "offense",
            ConditionField.DEFENSE_SCORE: "defense",
            ConditionField.SUPPORT_SCORE: "support",
            ConditionField.KILLS_PER_MINUTE: "kills_per_minute",
            ConditionField.DEATHS_PER_MINUTE: "deaths_per_minute",
            ConditionField.KILL_STREAK: "kills_streak",
            ConditionField.PLAYTIME_SECONDS: "map_playtime_seconds",
        }

        if field in simple_player_fields:
            return simple_player_fields[field]()

        if field in player_stats_fields and player_info:
            return player_info.get(player_stats_fields[field], 0)

        if field == ConditionField.KILL_DEATH_RATIO and player_info:
            kills = player_info.get("kills", 0)
            deaths = player_info.get("deaths", 0)
            return kills / deaths if deaths > 0 else kills

        profile_fields = {
            ConditionField.TOTAL_PLAYTIME_SECONDS: "total_playtime_seconds",
            ConditionField.SESSIONS_COUNT: "sessions_count",
            ConditionField.PENALTY_COUNT: "penalty_count",
        }

        if field in profile_fields:
            try:
                profile = get_player_profile(player_id, 0)
                if profile:
                    return profile.get(profile_fields[field], 0)
            except Exception as e:
                logger.warning(f"Failed to get player profile for {player_id}: {e}")
            return None

        if gamestate:
            if field == ConditionField.SERVER_PLAYER_COUNT:
                return gamestate["num_allied_players"] + gamestate["num_axis_players"]

            if field == ConditionField.MAP_NAME:
                return gamestate["current_map"]

            if field == ConditionField.MATCH_TIME_REMAINING:
                time_str = gamestate.get("raw_time_remaining", "0:00:00")
                parts = time_str.split(":")
                if len(parts) == 3:
                    hours, minutes, seconds = map(int, parts)
                    return hours * 3600 + minutes * 60 + seconds
                return 0

        if field == ConditionField.TEAM_PLAYER_COUNT and player_info and gamestate:
            team_counts = {
                "allies": gamestate["num_allied_players"],
                "axis": gamestate["num_axis_players"],
            }
            team = player_info.get("team")
            return team_counts.get(team)

        return None
    
    def _evaluate_condition(
        self,
        condition: Condition,
        player_id: str,
        player_info: GetDetailedPlayer | None = None,
        gamestate: GameStateType | None = None,
    ) -> bool:
        field_value = self._get_field_value(condition.field, player_id, player_info, gamestate)
        target_value = condition.value

        logger.debug(f"Evaluating: {condition.field} {condition.operator} '{target_value}' (field_value='{field_value}')")

        if field_value is None:
            logger.debug(f"Field {condition.field} returned None, condition fails")
            return False

        comparison_ops = {
            ComparisonOperator.EQUAL: lambda f, t: f == t,
            ComparisonOperator.NOT_EQUAL: lambda f, t: f != t,
            ComparisonOperator.GREATER_THAN: lambda f, t: float(f) > float(t),
            ComparisonOperator.GREATER_THAN_OR_EQUAL: lambda f, t: float(f) >= float(t),
            ComparisonOperator.LESS_THAN: lambda f, t: float(f) < float(t),
            ComparisonOperator.LESS_THAN_OR_EQUAL: lambda f, t: float(f) <= float(t),
            ComparisonOperator.CONTAINS: lambda f, t: str(t).lower() in str(f).lower(),
            ComparisonOperator.NOT_CONTAINS: lambda f, t: str(t).lower() not in str(f).lower(),
            ComparisonOperator.STARTS_WITH: lambda f, t: str(f).lower().startswith(str(t).lower()),
            ComparisonOperator.ENDS_WITH: lambda f, t: str(f).lower().endswith(str(t).lower()),
            ComparisonOperator.REGEX_MATCH: lambda f, t: bool(re.match(str(t), str(f))),
        }

        try:
            comparison_func = comparison_ops.get(condition.operator)
            if comparison_func:
                result = comparison_func(field_value, target_value)
                logger.debug(f"Condition result: {result}")
                return result

            logger.warning(f"Unknown operator: {condition.operator}")
            return False

        except (ValueError, TypeError) as e:
            logger.warning(f"Error evaluating condition {condition.field} {condition.operator} {target_value}: {e}")
            return False
    
    def _evaluate_conditions(
        self,
        rule: ConditionalRule,
        player_id: str,
        player_info: GetDetailedPlayer | None = None,
        gamestate: GameStateType | None = None,
    ) -> bool:
        results = [
            self._evaluate_condition(cond, player_id, player_info, gamestate)
            for cond in rule.conditions
        ]

        logger.debug(f"[{rule.name}] Condition results: {results}, Logical operator: {rule.logical_operator}")

        logical_ops = {
            LogicalOperator.AND: lambda r: all(r),
            LogicalOperator.OR: lambda r: any(r),
            LogicalOperator.NAND: lambda r: not all(r),
            LogicalOperator.NOR: lambda r: not any(r),
        }

        logical_func = logical_ops.get(rule.logical_operator)
        if logical_func:
            result = logical_func(results)
            logger.debug(f"[{rule.name}] Final evaluation result: {result}")
            return result

        logger.warning(f"Unknown logical operator: {rule.logical_operator}")
        return False

    def _action_message_player(self, params, player_id, player_name, rule_name):
        message = params.get("message", "")
        self.rcon.message_player(player_id=player_id, message=message)
        logger.info(f"[{rule_name}] Messaged player {player_name}: {message}")

    def _action_message_all_players(self, params, _player_id, _player_name, rule_name):
        message = params.get("message", "")
        self.rcon.message_all_players(message=message)
        logger.info(f"[{rule_name}] Messaged all players: {message}")

    def _action_kick_player(self, params, player_id, player_name, rule_name):
        reason = params.get("reason", "Kicked by conditional action")
        self.rcon.kick(
            player_id=player_id,
            reason=reason,
            by=f"ConditionalAction[{rule_name}]",
            player_name=player_name
        )
        logger.info(f"[{rule_name}] Kicked player {player_name}: {reason}")

    def _action_punish_player(self, params, player_id, player_name, rule_name):
        reason = params.get("reason", "Punished by conditional action")
        self.rcon.punish(player_id=player_id, reason=reason)
        logger.info(f"[{rule_name}] Punished player {player_name}: {reason}")

    def _action_temp_ban_player(self, params, player_id, player_name, rule_name):
        reason = params.get("reason", "Temp banned by conditional action")
        duration_hours = params.get("duration_hours", 2)
        self.rcon.temp_ban(
            player_id=player_id,
            duration_hours=duration_hours,
            reason=reason,
            by=f"ConditionalAction[{rule_name}]",
            player_name=player_name
        )
        logger.info(f"[{rule_name}] Temp banned player {player_name} for {duration_hours}h: {reason}")

    def _action_perma_ban_player(self, params, player_id, player_name, rule_name):
        reason = params.get("reason", "Perma banned by conditional action")
        self.rcon.perma_ban(
            player_id=player_id,
            reason=reason,
            by=f"ConditionalAction[{rule_name}]",
            player_name=player_name
        )
        logger.info(f"[{rule_name}] Perma banned player {player_name}: {reason}")

    def _action_add_player_flag(self, params, player_id, player_name, rule_name):
        flag = params.get("flag", "")
        comment = params.get("comment", f"Added by conditional action: {rule_name}")
        self.rcon.flag_player(
            player_id=player_id,
            flag=flag,
            comment=comment,
            player_name=player_name
        )
        logger.info(f"[{rule_name}] Added flag '{flag}' to player {player_name}")

    def _action_remove_player_flag(self, params, player_id, player_name, rule_name):
        flag = params.get("flag", "")
        self.rcon.unflag_player(player_id=player_id, flag=flag)
        logger.info(f"[{rule_name}] Removed flag '{flag}' from player {player_name}")

    def _action_add_to_watchlist(self, params, player_id, player_name, rule_name):
        reason = params.get("reason", f"Added by conditional action: {rule_name}")
        self.rcon.watch_player(
            player_id=player_id,
            reason=reason,
            by=f"ConditionalAction[{rule_name}]",
            player_name=player_name
        )
        logger.info(f"[{rule_name}] Added player {player_name} to watchlist")

    def _action_broadcast_message(self, params, _player_id, _player_name, rule_name):
        message = params.get("message", "")
        self.rcon.set_broadcast(message)
        logger.info(f"[{rule_name}] Set broadcast: {message}")

    def _action_temporary_broadcast(self, params, _player_id, _player_name, rule_name):
        message = params.get("message", "")
        duration = params.get("duration_seconds", 60)
        temporary_broadcast(self.rcon, message, duration)
        logger.info(f"[{rule_name}] Set temporary broadcast for {duration}s: {message}")

    @staticmethod
    def _action_send_discord_webhook(params, _player_id, _player_name, rule_name):
        _webhook_url = params.get("webhook_url", "")
        message = params.get("message", "")
        logger.info(f"[{rule_name}] Discord webhook: {message}")
        # TODO: Implement Discord webhook sending with _webhook_url

    def _action_switch_player_team(self, params, player_id, player_name, rule_name):
        self.rcon.switch_player_now(player_id=player_id)
        logger.info(f"[{rule_name}] Switched player {player_name} to opposite team")

    def _execute_action(
        self,
        action: Action,
        player_id: str,
        player_name: str,
        rule_name: str,
    ):
        action_handlers = {
            ActionType.MESSAGE_PLAYER: self._action_message_player,
            ActionType.MESSAGE_ALL_PLAYERS: self._action_message_all_players,
            ActionType.KICK_PLAYER: self._action_kick_player,
            ActionType.PUNISH_PLAYER: self._action_punish_player,
            ActionType.TEMP_BAN_PLAYER: self._action_temp_ban_player,
            ActionType.PERMA_BAN_PLAYER: self._action_perma_ban_player,
            ActionType.ADD_PLAYER_FLAG: self._action_add_player_flag,
            ActionType.REMOVE_PLAYER_FLAG: self._action_remove_player_flag,
            ActionType.ADD_TO_WATCHLIST: self._action_add_to_watchlist,
            ActionType.BROADCAST_MESSAGE: self._action_broadcast_message,
            ActionType.TEMPORARY_BROADCAST: self._action_temporary_broadcast,
            ActionType.SEND_DISCORD_WEBHOOK: self._action_send_discord_webhook,
            ActionType.SWITCH_PLAYER_TEAM: self._action_switch_player_team,
        }

        try:
            handler = action_handlers.get(action.action_type)
            if handler:
                handler(action.parameters, player_id, player_name, rule_name)
            else:
                logger.warning(f"[{rule_name}] Unknown action type: {action.action_type}")
        except Exception as e:
            logger.error(f"[{rule_name}] Failed to execute action {action.action_type}: {e}")

    def process_rule(
        self,
        rule: ConditionalRule,
        player_id: str,
        player_info: GetDetailedPlayer | None = None,
        gamestate: GameStateType | None = None,
    ):
        if not rule.enabled:
            return

        if not self._check_cooldown(rule, player_id):
            logger.debug(f"Rule {rule.name} is in cooldown for player {player_id}")
            return

        if not self._check_execution_limit(rule, player_id):
            logger.debug(f"Rule {rule.name} has reached execution limit for player {player_id}")
            return

        if not self._evaluate_conditions(rule, player_id, player_info, gamestate):
            logger.debug(f"Rule {rule.name} conditions not met for player {player_id}")
            return

        player_name = player_info.get("name", "Unknown") if player_info else "Unknown"
        logger.info(f"Rule {rule.name} triggered for player {player_name} ({player_id})")

        for action in rule.actions:
            self._execute_action(action, player_id, player_name, rule.name)

        self._record_execution(rule, player_id)

    def process_event(
        self,
        trigger_event: str,
        player_id: str,
        struct_log: StructuredLogLineWithMetaData | None = None,
    ):
        config = ConditionalActionsUserConfig.load_from_db()

        if not config.enabled:
            logger.debug(f"Conditional actions system is disabled")
            return

        logger.debug(f"Processing event {trigger_event} for player {player_id}")

        try:
            players = self.rcon.get_detailed_players()
            player_info = players.get("players", {}).get(player_id)
            gamestate = self.rcon.get_gamestate()
        except Exception as e:
            logger.error(f"Failed to get player/game data: {e}")
            return

        matching_rules = [rule for rule in config.rules if rule.trigger_event.value == trigger_event]
        logger.debug(f"Found {len(matching_rules)} rules for event {trigger_event}")

        for rule in config.rules:
            if rule.trigger_event.value == trigger_event:
                logger.debug(f"Processing rule: {rule.name}")
                self.process_rule(rule, player_id, player_info, gamestate)

