import json
import logging
import re
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

import requests

from rcon.cache_utils import get_redis_client
from rcon.discord import send_to_discord_audit
from rcon.player_history import add_flag_to_player, get_player_profile, remove_flag
from rcon.rcon import Rcon, StructuredLogLineWithMetaData
from rcon.types import GetDetailedPlayer, GameStateType
from rcon.watchlist import PlayerWatch
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
    """Evaluates conditional rules against player/game state and executes actions.

    Used by both event hooks (reactive triggers) and the service daemon (periodic triggers).
    Supports template variable substitution in messages and Redis-backed cooldown/rate limiting.
    """

    def __init__(self, rcon: Rcon):
        self.rcon = rcon
        self.redis = get_redis_client()
        # Cache to avoid redundant API calls within the same processing cycle
        self._players_cache: dict | None = None
        self._gamestate_cache: GameStateType | None = None

    def _get_players(self) -> dict:
        """Get detailed players, using cache if available."""
        if self._players_cache is None:
            self._players_cache = self.rcon.get_detailed_players()
        return self._players_cache

    def _get_gamestate(self) -> GameStateType:
        """Get game state, using cache if available."""
        if self._gamestate_cache is None:
            self._gamestate_cache = self.rcon.get_gamestate()
        return self._gamestate_cache

    def invalidate_cache(self):
        """Clear cached data. Call between processing cycles."""
        self._players_cache = None
        self._gamestate_cache = None

    @staticmethod
    def _render_template(
        template: str,
        player_id: str,
        player_name: str,
        player_info: GetDetailedPlayer | None = None,
        gamestate: GameStateType | None = None,
    ) -> str:
        """Replace {variable} placeholders in messages with actual values."""
        variables = {
            "player_name": player_name,
            "player_id": player_id,
        }
        if player_info:
            variables.update({
                "player_level": player_info.get("level", ""),
                "kills": player_info.get("kills", 0),
                "deaths": player_info.get("deaths", 0),
                "teamkills": player_info.get("team_kills", 0),
                "combat": player_info.get("combat", 0),
                "offense": player_info.get("offense", 0),
                "defense": player_info.get("defense", 0),
                "support": player_info.get("support", 0),
                "team": player_info.get("team", ""),
                "unit_name": player_info.get("unit_name", ""),
                "role": player_info.get("role", ""),
                "is_vip": player_info.get("is_vip", False),
            })
        if gamestate:
            variables.update({
                "map_name": gamestate.get("current_map", {}).get("map", {}).get("pretty_name", ""),
                "server_player_count": gamestate.get("num_allied_players", 0) + gamestate.get("num_axis_players", 0),
            })

        result = template
        for key, value in variables.items():
            result = result.replace(f"{{{key}}}", str(value))
        return result

    @staticmethod
    def _get_execution_count_key(rule_id: str, player_id: str) -> str:
        return f"conditional_action:executions:{rule_id}:{player_id}"

    @staticmethod
    def _get_last_execution_key(rule_id: str, player_id: str) -> str:
        return f"conditional_action:last_exec:{rule_id}:{player_id}"

    def _check_cooldown(self, rule: ConditionalRule, player_id: str) -> bool:
        if rule.cooldown_seconds == 0:
            return True

        try:
            last_exec_key = self._get_last_execution_key(rule.id, player_id)
            last_exec = self.redis.get(last_exec_key)

            if not last_exec:
                return True

            last_exec_time = datetime.fromisoformat(last_exec.decode())
            cooldown_end = last_exec_time + timedelta(seconds=rule.cooldown_seconds)

            return datetime.now() > cooldown_end
        except Exception as e:
            logger.warning(
                "Redis error in cooldown check for rule %s: %s. Blocking action as safety.",
                rule.name, e,
            )
            return False

    def _check_execution_limit(self, rule: ConditionalRule, player_id: str) -> bool:
        if rule.max_executions_per_player == 0:
            return True

        try:
            exec_count_key = self._get_execution_count_key(rule.id, player_id)
            exec_count = self.redis.get(exec_count_key)

            if not exec_count:
                return True

            return int(exec_count) < rule.max_executions_per_player
        except Exception as e:
            logger.warning(
                "Redis error in execution limit check for rule %s: %s. Blocking action as safety.",
                rule.name, e,
            )
            return False

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
        context: dict | None = None,
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
            ConditionField.TEAMKILLS: "team_kills",
            ConditionField.COMBAT_SCORE: "combat",
            ConditionField.OFFENSE_SCORE: "offense",
            ConditionField.DEFENSE_SCORE: "defense",
            ConditionField.SUPPORT_SCORE: "support",
            ConditionField.PLAYTIME_SECONDS: "map_playtime_seconds",
        }

        if field in simple_player_fields:
            return simple_player_fields[field]()

        if field in player_stats_fields and player_info:
            return player_info.get(player_stats_fields[field], 0)

        # Computed fields
        if player_info:
            if field == ConditionField.KILLS_PER_MINUTE:
                playtime = player_info.get("map_playtime_seconds", 0)
                if playtime > 0:
                    return round(player_info.get("kills", 0) / (playtime / 60), 2)
                return 0.0

            if field == ConditionField.DEATHS_PER_MINUTE:
                playtime = player_info.get("map_playtime_seconds", 0)
                if playtime > 0:
                    return round(player_info.get("deaths", 0) / (playtime / 60), 2)
                return 0.0

            if field == ConditionField.KILL_STREAK:
                # kill_streak is not tracked by the game server per-player
                # This field is not reliably available from get_detailed_players
                return player_info.get("kills_streak", 0)

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
                logger.warning("Failed to get player profile for %s: %s", player_id, e)
            return None

        if gamestate:
            if field == ConditionField.SERVER_PLAYER_COUNT:
                return gamestate["num_allied_players"] + gamestate["num_axis_players"]

            if field == ConditionField.MAP_NAME:
                current_map = gamestate.get("current_map")
                if isinstance(current_map, dict):
                    return current_map.get("map", {}).get("pretty_name", str(current_map))
                return str(current_map) if current_map else None

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

        # Context fields (chat message, etc.)
        if context:
            if field == ConditionField.MESSAGE_CONTENT:
                return context.get("message_content", "")
            if field == ConditionField.MESSAGE_SCOPE:
                return context.get("message_scope", "")

        return None

    def _evaluate_condition(
        self,
        condition: Condition,
        player_id: str,
        player_info: GetDetailedPlayer | None = None,
        gamestate: GameStateType | None = None,
        context: dict | None = None,
    ) -> bool:
        field_value = self._get_field_value(condition.field, player_id, player_info, gamestate, context)
        target_value = condition.value

        logger.debug(
            "Evaluating: %s %s '%s' (field_value='%s')",
            condition.field, condition.operator, target_value, field_value,
        )

        if field_value is None:
            logger.debug("Field %s returned None, condition fails", condition.field)
            return False

        # Normalize booleans: JSON may send "true"/"false" strings
        if isinstance(field_value, bool) or isinstance(target_value, bool):
            def _to_bool(v):
                if isinstance(v, bool):
                    return v
                if isinstance(v, str):
                    return v.lower() in ("true", "1", "yes")
                return bool(v)
            field_value = _to_bool(field_value)
            target_value = _to_bool(target_value)

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
                logger.debug("Condition result: %s", result)
                return result

            logger.warning("Unknown operator: %s", condition.operator)
            return False

        except (ValueError, TypeError) as e:
            logger.warning(
                "Error evaluating condition %s %s %s: %s",
                condition.field, condition.operator, target_value, e,
            )
            return False

    def _evaluate_conditions(
        self,
        rule: ConditionalRule,
        player_id: str,
        player_info: GetDetailedPlayer | None = None,
        gamestate: GameStateType | None = None,
        context: dict | None = None,
    ) -> bool:
        results = [
            self._evaluate_condition(cond, player_id, player_info, gamestate, context)
            for cond in rule.conditions
        ]

        logger.debug(
            "[%s] Condition results: %s, Logical operator: %s",
            rule.name, results, rule.logical_operator,
        )

        logical_ops = {
            LogicalOperator.AND: lambda r: all(r),
            LogicalOperator.OR: lambda r: any(r),
            LogicalOperator.NAND: lambda r: not all(r),
            LogicalOperator.NOR: lambda r: not any(r),
        }

        logical_func = logical_ops.get(rule.logical_operator)
        if logical_func:
            result = logical_func(results)
            logger.debug("[%s] Final evaluation result: %s", rule.name, result)
            return result

        logger.warning("Unknown logical operator: %s", rule.logical_operator)
        return False

    def _audit_action(self, rule_name: str, action_type: str, player_name: str, details: str = ""):
        try:
            send_to_discord_audit(
                message=details if details else f"Executed on {player_name}",
                command_name=f"conditional_action:{rule_name}:{action_type}",
                by="conditional_actions",
            )
        except Exception as e:
            logger.warning("Failed to send audit for rule %s: %s", rule_name, e)

    def _action_message_player(self, params, player_id, player_name, rule_name, player_info=None, gamestate=None):
        message = self._render_template(
            params.get("message", ""), player_id, player_name, player_info, gamestate,
        )
        self.rcon.message_player(player_id=player_id, message=message)
        logger.info("[%s] Messaged player %s: %s", rule_name, player_name, message)

    def _action_message_all_players(self, params, _player_id, player_name, rule_name, player_info=None, gamestate=None):
        message = self._render_template(
            params.get("message", ""), _player_id, player_name, player_info, gamestate,
        )
        self.rcon.message_all_players(message=message)
        logger.info("[%s] Messaged all players: %s", rule_name, message)

    def _action_kick_player(self, params, player_id, player_name, rule_name, player_info=None, gamestate=None):
        reason = self._render_template(
            params.get("reason", "Kicked by conditional action"), player_id, player_name, player_info, gamestate,
        )
        self.rcon.kick(
            player_id=player_id,
            reason=reason,
            by=f"ConditionalAction[{rule_name}]",
            player_name=player_name,
        )
        self._audit_action(rule_name, "kick", player_name, reason)
        logger.info("[%s] Kicked player %s: %s", rule_name, player_name, reason)

    def _action_punish_player(self, params, player_id, player_name, rule_name, player_info=None, gamestate=None):
        reason = self._render_template(
            params.get("reason", "Punished by conditional action"), player_id, player_name, player_info, gamestate,
        )
        self.rcon.punish(
            player_id=player_id,
            reason=reason,
            by=f"ConditionalAction[{rule_name}]",
            player_name=player_name,
        )
        self._audit_action(rule_name, "punish", player_name, reason)
        logger.info("[%s] Punished player %s: %s", rule_name, player_name, reason)

    def _action_temp_ban_player(self, params, player_id, player_name, rule_name, player_info=None, gamestate=None):
        reason = self._render_template(
            params.get("reason", "Temp banned by conditional action"), player_id, player_name, player_info, gamestate,
        )
        duration_hours = params.get("duration_hours", 2)
        self.rcon.temp_ban(
            player_id=player_id,
            duration_hours=duration_hours,
            reason=reason,
            by=f"ConditionalAction[{rule_name}]",
            player_name=player_name,
        )
        self._audit_action(rule_name, "temp_ban", player_name, f"{reason} ({duration_hours}h)")
        logger.info("[%s] Temp banned player %s for %sh: %s", rule_name, player_name, duration_hours, reason)

    def _action_perma_ban_player(self, params, player_id, player_name, rule_name, player_info=None, gamestate=None):
        reason = self._render_template(
            params.get("reason", "Perma banned by conditional action"), player_id, player_name, player_info, gamestate,
        )
        self.rcon.perma_ban(
            player_id=player_id,
            reason=reason,
            by=f"ConditionalAction[{rule_name}]",
            player_name=player_name,
        )
        self._audit_action(rule_name, "perma_ban", player_name, reason)
        logger.info("[%s] Perma banned player %s: %s", rule_name, player_name, reason)

    def _action_add_player_flag(self, params, player_id, player_name, rule_name, **_):
        flag = params.get("flag", "")
        comment = params.get("comment", f"Added by conditional action: {rule_name}")
        try:
            add_flag_to_player(
                player_id=player_id,
                flag=flag,
                comment=comment,
                player_name=player_name,
            )
            self._audit_action(rule_name, "add_flag", player_name, f"flag={flag}")
            logger.info("[%s] Added flag '%s' to player %s", rule_name, flag, player_name)
        except Exception as e:
            logger.warning("[%s] Could not add flag '%s' to %s: %s (may already exist)", rule_name, flag, player_name, e)

    def _action_remove_player_flag(self, params, player_id, player_name, rule_name, **_):
        flag = params.get("flag", "")
        remove_flag(player_id=player_id, flag=flag)
        logger.info("[%s] Removed flag '%s' from player %s", rule_name, flag, player_name)

    def _action_add_to_watchlist(self, params, player_id, player_name, rule_name, **_):
        reason = params.get("reason", f"Added by conditional action: {rule_name}")
        watcher = PlayerWatch(player_id=player_id)
        watcher.watch(
            reason=reason,
            by=f"ConditionalAction[{rule_name}]",
            player_name=player_name or "",
        )
        self._audit_action(rule_name, "watchlist", player_name, reason)
        logger.info("[%s] Added player %s to watchlist", rule_name, player_name)

    def _action_broadcast_message(self, params, player_id, player_name, rule_name, player_info=None, gamestate=None):
        message = self._render_template(
            params.get("message", ""), player_id, player_name, player_info, gamestate,
        )
        # Use temporary_broadcast to avoid overwriting the admin's permanent broadcast
        duration = params.get("duration_seconds", 300)
        temporary_broadcast(self.rcon, message, duration)
        logger.info("[%s] Set broadcast (%ss): %s", rule_name, duration, message)

    def _action_temporary_broadcast(self, params, player_id, player_name, rule_name, player_info=None, gamestate=None):
        message = self._render_template(
            params.get("message", ""), player_id, player_name, player_info, gamestate,
        )
        duration = params.get("duration_seconds", 60)
        temporary_broadcast(self.rcon, message, duration)
        logger.info("[%s] Set temporary broadcast for %ss: %s", rule_name, duration, message)

    def _action_send_discord_webhook(self, params, player_id, player_name, rule_name, player_info=None, gamestate=None):
        webhook_url = params.get("webhook_url", "")
        message = self._render_template(
            params.get("message", ""), player_id, player_name, player_info, gamestate,
        )

        if not webhook_url:
            logger.warning("[%s] Discord webhook URL is empty", rule_name)
            return

        try:
            payload = {
                "content": f"[ConditionalAction: {rule_name}] {message}",
                "username": "CRCON Conditional Actions",
            }
            response = requests.post(webhook_url, json=payload, timeout=5)
            response.raise_for_status()
            logger.info("[%s] Sent Discord webhook for %s: %s", rule_name, player_name, message)
        except Exception as e:
            logger.error("[%s] Failed to send Discord webhook: %s", rule_name, e)

    def _action_switch_player_team(self, params, player_id, player_name, rule_name, **_):
        self.rcon.switch_player_now(player_id=player_id)
        self._audit_action(rule_name, "switch_team", player_name)
        logger.info("[%s] Switched player %s to opposite team", rule_name, player_name)

    def _action_broadcast_match_summary(self, params, player_id, player_name, rule_name, **_):
        """Build and broadcast a match-end leaderboard summary."""
        # Dedup: only run once per match_end event (not once per player)
        dedup_key = f"conditional_action:match_summary:{rule_name}"
        if not self.redis.set(dedup_key, "1", ex=30, nx=True):
            logger.debug("[%s] Match summary already sent (dedup), skipping", rule_name)
            return

        try:
            players = self._get_players()
            all_players = list(players.get("players", {}).values())

            if not all_players:
                logger.warning("[%s] No players found for match summary", rule_name)
                return

            top_count = int(params.get("top_count", 5))
            header = params.get("header_message", "")
            footer = params.get("footer_message", "")

            # Define leaderboard categories
            categories_config = {
                "kills": {"label": params.get("label_kills", "Top Kills"), "field": "kills", "suffix": "kills"},
                "deaths": {"label": params.get("label_deaths", "Most Deaths"), "field": "deaths", "suffix": "deaths"},
                "combat": {"label": params.get("label_combat", "Top Combat"), "field": "combat", "suffix": "pts"},
                "offense": {"label": params.get("label_offense", "Top Offense"), "field": "offense", "suffix": "pts"},
                "defense": {"label": params.get("label_defense", "Top Defense"), "field": "defense", "suffix": "pts"},
                "support": {"label": params.get("label_support", "Top Support"), "field": "support", "suffix": "pts"},
            }

            # Which categories to show (comma-separated or "all")
            show_categories = params.get("categories", "kills,support,combat,offense,defense")
            if show_categories == "all":
                selected = list(categories_config.keys())
            else:
                selected = [c.strip() for c in show_categories.split(",") if c.strip() in categories_config]

            if not selected:
                selected = ["kills", "support"]

            # Build each category's rows first
            category_blocks = []
            for cat_key in selected:
                cat = categories_config[cat_key]
                sorted_players = sorted(all_players, key=lambda p: p.get(cat["field"], 0), reverse=True)
                top = sorted_players[:top_count]

                category_rows = []
                for i, p in enumerate(top, 1):
                    value = p.get(cat["field"], 0)
                    if value > 0:
                        category_rows.append(f"{i}. {p.get('name', '?')}  -  {value} {cat['suffix']}")

                if category_rows:
                    category_blocks.append((cat["label"], category_rows))

            # Don't broadcast an empty summary (just header + footer)
            if not category_blocks:
                logger.info("[%s] No match summary data to broadcast", rule_name)
                return

            lines = []
            if header:
                lines.append(header)
                lines.append("")

            for label, rows in category_blocks:
                lines.append(f"--- {label} ---")
                lines.extend(rows)
                lines.append("")

            if footer:
                lines.append(footer)

            message = "\n".join(lines)
            self.rcon.message_all_players(message=message)
            logger.info("[%s] Broadcast match summary:\n%s", rule_name, message)

        except Exception as e:
            logger.error("[%s] Failed to build match summary: %s", rule_name, e)

    def _action_broadcast_role_leaderboard(self, params, player_id, player_name, rule_name, **_):
        """Broadcast best player per role/class at match end."""
        dedup_key = f"conditional_action:role_leaderboard:{rule_name}"
        if not self.redis.set(dedup_key, "1", ex=30, nx=True):
            return

        try:
            players = self._get_players()
            all_players = list(players.get("players", {}).values())

            if not all_players:
                return

            header = params.get("header_message", "")
            footer = params.get("footer_message", "")

            # Role configs: role_name -> (display_label, sort_field, suffix)
            role_configs = {
                "officer": (params.get("label_officer", "Best Officer"), "offense", "offense"),
                "medic": (params.get("label_medic", "Best Medic"), "support", "support"),
                "engineer": (params.get("label_engineer", "Best Engineer"), "support", "support"),
                "support": (params.get("label_support_role", "Best Support"), "support", "support"),
                "antitank": (params.get("label_antitank", "Best Anti-Tank"), "combat", "combat"),
                "sniper": (params.get("label_sniper", "Best Sniper"), "kills", "kills"),
                "spotter": (params.get("label_spotter", "Best Spotter"), "kills", "kills"),
                "tankcommander": (params.get("label_tank", "Best Tank Commander"), "kills", "kills"),
                "assault": (params.get("label_assault", "Best Assault"), "kills", "kills"),
                "automaticrifleman": (params.get("label_mg", "Best Machine Gunner"), "kills", "kills"),
                "rifleman": (params.get("label_rifleman", "Best Rifleman"), "kills", "kills"),
                "armycommander": (params.get("label_commander", "Best Commander"), "offense", "offense"),
            }

            # Which roles to show
            show_roles = params.get("roles", "officer,medic,engineer,sniper,tankcommander,antitank,assault")
            if show_roles == "all":
                selected_roles = list(role_configs.keys())
            else:
                selected_roles = [r.strip() for r in show_roles.split(",") if r.strip() in role_configs]

            # Group players by role
            players_by_role = defaultdict(list)
            for p in all_players:
                role = p.get("role")
                if role:
                    players_by_role[role].append(p)

            # Build role rows first, only emit header if at least one role has a player
            role_rows = []
            for role_key in selected_roles:
                if role_key not in players_by_role:
                    continue
                label, sort_field, suffix = role_configs[role_key]
                best = max(players_by_role[role_key], key=lambda p: p.get(sort_field, 0))
                value = best.get(sort_field, 0)
                if value > 0:
                    role_rows.append(f"{label}: {best.get('name', '?')} ({value} {suffix})")

            if not role_rows:
                logger.info("[%s] No role leaderboard data to broadcast", rule_name)
                return

            lines = []
            if header:
                lines.append(header)
                lines.append("")

            lines.append("--- Best by Role ---")
            lines.extend(role_rows)

            lines.append("")
            if footer:
                lines.append(footer)

            message = "\n".join(lines)
            self.rcon.message_all_players(message=message)
            logger.info("[%s] Broadcast role leaderboard:\n%s", rule_name, message)

        except Exception as e:
            logger.error("[%s] Failed to build role leaderboard: %s", rule_name, e)

    def _action_broadcast_squad_leaderboard(self, params, player_id, player_name, rule_name, **_):
        """Broadcast best squads at match end using get_team_view()."""
        dedup_key = f"conditional_action:squad_leaderboard:{rule_name}"
        if not self.redis.set(dedup_key, "1", ex=30, nx=True):
            return

        try:
            team_view = self.rcon.get_team_view()

            if not team_view:
                return

            top_count = int(params.get("top_count", 3))
            header = params.get("header_message", "")
            footer = params.get("footer_message", "")
            sort_by = params.get("sort_by", "kills")  # kills, combat, support, offense, defense

            all_squads = []
            for team_key in ("allies", "axis"):
                team_data = team_view.get(team_key, {})
                if not isinstance(team_data, dict):
                    continue
                team_label = "Allies" if team_key == "allies" else "Axis"
                squads = team_data.get("squads", {})
                for squad_name, squad_data in squads.items():
                    players = squad_data.get("players", [])
                    if not players:
                        continue
                    # get_team_view() pre-computes squad totals
                    all_squads.append({
                        "name": squad_name.upper(),
                        "team": team_label,
                        "count": len(players),
                        "kills": squad_data.get("kills", 0),
                        "deaths": squad_data.get("deaths", 0),
                        "combat": squad_data.get("combat", 0),
                        "offense": squad_data.get("offense", 0),
                        "defense": squad_data.get("defense", 0),
                        "support": squad_data.get("support", 0),
                    })

            if not all_squads:
                return

            all_squads.sort(key=lambda s: s.get(sort_by, 0), reverse=True)
            # Filter out squads with zero value on the sort field (e.g. inactive squads)
            top_squads = [sq for sq in all_squads[:top_count] if sq.get(sort_by, 0) > 0]

            if not top_squads:
                logger.info("[%s] No squad leaderboard data to broadcast", rule_name)
                return

            lines = []
            if header:
                lines.append(header)
                lines.append("")

            lines.append("--- Best Squads ---")
            for i, sq in enumerate(top_squads, 1):
                lines.append(
                    f"{i}. {sq['name']} ({sq['team']}) - "
                    f"{sq['kills']} kills, {sq['combat']} combat, "
                    f"{sq['support']} support [{sq['count']} players]"
                )

            lines.append("")
            if footer:
                lines.append(footer)

            message = "\n".join(lines)
            self.rcon.message_all_players(message=message)
            logger.info("[%s] Broadcast squad leaderboard:\n%s", rule_name, message)

        except Exception as e:
            logger.error("[%s] Failed to build squad leaderboard: %s", rule_name, e)

    def _action_broadcast_seasonal_leaderboard(self, params, player_id, player_name, rule_name, **_):
        """
        Accumulate player stats in Redis across matches and broadcast seasonal leaderboard.

        On match_end: updates cumulative stats for every player.
        Broadcasts the all-time seasonal ranking.
        """
        dedup_key = f"conditional_action:seasonal:{rule_name}"
        if not self.redis.set(dedup_key, "1", ex=30, nx=True):
            return

        try:
            players = self._get_players()
            all_players = list(players.get("players", {}).values())

            if not all_players:
                return

            top_count = int(params.get("top_count", 10))
            header = params.get("header_message", "")
            footer = params.get("footer_message", "")
            season_name = params.get("season_name", "Season 1")
            # Season TTL in days (default 30 days). Set 0 for no expiry.
            season_days = int(params.get("season_days", 30))
            season_ttl = season_days * 86400 if season_days > 0 else 0
            sort_by = params.get("sort_by", "kills")  # kills, combat, support

            season_key = f"conditional_action:season:{rule_name}"

            # --- Phase 1: Update cumulative stats for all current players ---
            for p in all_players:
                pid = p.get("player_id", "")
                pname = p.get("name", "?")
                if not pid:
                    continue

                player_season_key = f"{season_key}:{pid}"
                existing_raw = self.redis.get(player_season_key)

                if existing_raw:
                    existing = json.loads(existing_raw)
                else:
                    existing = {
                        "name": pname,
                        "kills": 0,
                        "deaths": 0,
                        "combat": 0,
                        "offense": 0,
                        "defense": 0,
                        "support": 0,
                        "matches": 0,
                    }

                # Accumulate this match stats
                existing["name"] = pname  # Always update to latest name
                existing["kills"] += p.get("kills", 0)
                existing["deaths"] += p.get("deaths", 0)
                existing["combat"] += p.get("combat", 0)
                existing["offense"] += p.get("offense", 0)
                existing["defense"] += p.get("defense", 0)
                existing["support"] += p.get("support", 0)
                existing["matches"] += 1

                if season_ttl > 0:
                    self.redis.set(player_season_key, json.dumps(existing), ex=season_ttl)
                else:
                    self.redis.set(player_season_key, json.dumps(existing))

                # Track player ID in a set so we can scan all participants
                self.redis.sadd(f"{season_key}:players", pid)
                if season_ttl > 0:
                    self.redis.expire(f"{season_key}:players", season_ttl)

            # --- Phase 2: Build full seasonal leaderboard ---
            all_pids = self.redis.smembers(f"{season_key}:players")
            seasonal_stats = []

            for pid_bytes in all_pids:
                pid = pid_bytes.decode() if isinstance(pid_bytes, bytes) else pid_bytes
                raw = self.redis.get(f"{season_key}:{pid}")
                if raw:
                    stats = json.loads(raw)
                    stats["player_id"] = pid
                    seasonal_stats.append(stats)

            if not seasonal_stats:
                return

            seasonal_stats.sort(key=lambda s: s.get(sort_by, 0), reverse=True)
            # Only show players with positive stats on the sort field
            top = [s for s in seasonal_stats[:top_count] if s.get(sort_by, 0) > 0]

            if not top:
                logger.info("[%s] No seasonal leaderboard data to broadcast", rule_name)
                return

            lines = []
            if header:
                lines.append(header)
                lines.append("")

            lines.append(f"--- {season_name} Leaderboard ---")
            for i, s in enumerate(top, 1):
                kd = s["kills"] / s["deaths"] if s["deaths"] > 0 else s["kills"]
                lines.append(
                    f"{i}. {s['name']} - "
                    f"{s['kills']} kills, {s['combat']} combat, "
                    f"{s['support']} support "
                    f"(K/D: {kd:.1f}, {s['matches']} matches)"
                )

            # Show total participants
            total_participants = len(seasonal_stats)
            lines.append("")
            lines.append(f"Total players this season: {total_participants}")

            if footer:
                lines.append("")
                lines.append(footer)

            message = "\n".join(lines)
            self.rcon.message_all_players(message=message)
            logger.info("[%s] Broadcast seasonal leaderboard:\n%s", rule_name, message)

        except Exception as e:
            logger.error("[%s] Failed to build seasonal leaderboard: %s", rule_name, e)

    def _execute_action(
        self,
        action: Action,
        player_id: str,
        player_name: str,
        rule_name: str,
        player_info: GetDetailedPlayer | None = None,
        gamestate: GameStateType | None = None,
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
            ActionType.BROADCAST_MATCH_SUMMARY: self._action_broadcast_match_summary,
            ActionType.BROADCAST_ROLE_LEADERBOARD: self._action_broadcast_role_leaderboard,
            ActionType.BROADCAST_SQUAD_LEADERBOARD: self._action_broadcast_squad_leaderboard,
            ActionType.BROADCAST_SEASONAL_LEADERBOARD: self._action_broadcast_seasonal_leaderboard,
        }

        try:
            handler = action_handlers.get(action.action_type)
            if handler:
                handler(action.parameters, player_id, player_name, rule_name, player_info=player_info, gamestate=gamestate)
            else:
                logger.warning("[%s] Unknown action type: %s", rule_name, action.action_type)
        except Exception as e:
            logger.error("[%s] Failed to execute action %s: %s", rule_name, action.action_type, e)

    def process_rule(
        self,
        rule: ConditionalRule,
        player_id: str,
        player_info: GetDetailedPlayer | None = None,
        gamestate: GameStateType | None = None,
        context: dict | None = None,
    ):
        """Evaluate a single rule against a player and execute actions if conditions are met."""
        if not rule.enabled:
            return

        if not self._check_cooldown(rule, player_id):
            logger.debug("Rule %s is in cooldown for player %s", rule.name, player_id)
            return

        if not self._check_execution_limit(rule, player_id):
            logger.debug("Rule %s has reached execution limit for player %s", rule.name, player_id)
            return

        if not self._evaluate_conditions(rule, player_id, player_info, gamestate, context):
            logger.debug("Rule %s conditions not met for player %s", rule.name, player_id)
            return

        player_name = player_info.get("name", "Unknown") if player_info else "Unknown"
        logger.info("Rule %s triggered for player %s (%s)", rule.name, player_name, player_id)

        for action in rule.actions:
            self._execute_action(
                action, player_id, player_name, rule.name,
                player_info=player_info, gamestate=gamestate,
            )

        self._record_execution(rule, player_id)

    def process_event(
        self,
        trigger_event: str,
        player_id: str,
        struct_log: StructuredLogLineWithMetaData | None = None,
        context: dict | None = None,
    ):
        """Process an event for a player: load config, find matching rules, evaluate and execute."""
        config = ConditionalActionsUserConfig.load_from_db()

        if not config.enabled:
            logger.debug("Conditional actions system is disabled")
            return

        logger.debug("Processing event %s for player %s", trigger_event, player_id)

        try:
            players = self._get_players()
            gamestate = self._get_gamestate()
        except Exception as e:
            logger.error("Failed to get player/game data: %s", e)
            return

        player_info = players.get("players", {}).get(player_id)

        # On connect, player might not be in the detailed list yet.
        # Build a minimal player_info from the struct_log so conditions/actions still work.
        if player_info is None and struct_log:
            player_name_from_log = struct_log.get("player_name_1") or struct_log.get("player", "")
            if player_name_from_log:
                logger.debug(
                    "player_info not found for %s, using struct_log fallback (name=%s)",
                    player_id, player_name_from_log,
                )
                player_info = {"name": player_name_from_log}

        matching_rules = [rule for rule in config.rules if rule.trigger_event.value == trigger_event]
        matching_rules.sort(key=lambda r: r.priority, reverse=True)
        logger.debug("Found %d rules for event %s", len(matching_rules), trigger_event)

        for rule in matching_rules:
            logger.debug("Processing rule: %s", rule.name)
            self.process_rule(rule, player_id, player_info, gamestate, context)

    def process_batch_event(
        self,
        trigger_event: str,
        struct_log: StructuredLogLineWithMetaData | None = None,
    ):
        """Process an event for ALL players at once with a single data fetch.

        Used by match_start/match_end hooks to avoid N calls to get_detailed_players().
        """
        config = ConditionalActionsUserConfig.load_from_db()

        if not config.enabled:
            return

        matching_rules = [rule for rule in config.rules if rule.trigger_event.value == trigger_event]
        if not matching_rules:
            return

        matching_rules.sort(key=lambda r: r.priority, reverse=True)

        try:
            players = self._get_players()
            gamestate = self._get_gamestate()
        except Exception as e:
            logger.error("Failed to get player/game data: %s", e)
            return

        all_players = players.get("players", {})
        logger.info(
            "Processing batch event %s for %d players, %d rules",
            trigger_event, len(all_players), len(matching_rules),
        )

        for player_id, player_info in all_players.items():
            for rule in matching_rules:
                try:
                    self.process_rule(rule, player_id, player_info, gamestate)
                except Exception:
                    logger.exception(
                        "Error processing rule %s for player %s",
                        rule.name, player_id,
                    )
