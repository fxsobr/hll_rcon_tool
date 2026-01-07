from django.views.decorators.csrf import csrf_exempt

from rcon.user_config.conditional_actions import ConditionalActionsUserConfig

from .auth import api_response, login_required
from .decorators import permission_required, require_http_methods


@csrf_exempt
@login_required()
@permission_required("api.can_view_conditional_actions_config", raise_exception=True)
@require_http_methods(["GET"])
def describe_conditional_actions_config(request):
    failed = False
    error = None
    
    try:
        config_description = {
            "enabled": {
                "type": "boolean",
                "description": "Enable or disable the conditional actions system",
                "default": False,
            },
            "rules": {
                "type": "array",
                "description": "List of conditional action rules",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "Unique identifier for the rule (auto-generated UUID)",
                        },
                        "name": {
                            "type": "string",
                            "description": "Human-readable name for the rule",
                            "required": True,
                        },
                        "description": {
                            "type": "string",
                            "description": "Optional description of what the rule does",
                        },
                        "enabled": {
                            "type": "boolean",
                            "description": "Whether this rule is active",
                            "default": True,
                        },
                        "trigger_event": {
                            "type": "string",
                            "description": "Event that triggers this rule",
                            "enum": [
                                "PLAYER_CONNECTED",
                                "PLAYER_DISCONNECTED",
                                "PLAYER_KILL",
                                "PLAYER_DEATH",
                                "PLAYER_TEAM_KILL",
                                "MATCH_START",
                                "MATCH_END",
                                "PLAYER_CHAT",
                                "PLAYER_TEAM_SWITCH",
                            ],
                            "required": True,
                        },
                        "logical_operator": {
                            "type": "string",
                            "description": "How to combine multiple conditions",
                            "enum": ["AND", "OR", "NAND", "NOR"],
                            "default": "AND",
                        },
                        "conditions": {
                            "type": "array",
                            "description": "List of conditions to evaluate",
                            "required": True,
                            "items": {
                                "type": "object",
                                "properties": {
                                    "field": {
                                        "type": "string",
                                        "description": "Player or game field to check",
                                        "enum": [
                                            "PLAYER_NAME",
                                            "PLAYER_ID",
                                            "PLAYER_LEVEL",
                                            "IS_VIP",
                                            "KILLS",
                                            "DEATHS",
                                            "KILL_DEATH_RATIO",
                                            "TEAMKILLS",
                                            "COMBAT_SCORE",
                                            "OFFENSE_SCORE",
                                            "DEFENSE_SCORE",
                                            "SUPPORT_SCORE",
                                            "KILLS_PER_MINUTE",
                                            "DEATHS_PER_MINUTE",
                                            "KILL_STREAK",
                                            "PLAYTIME_SECONDS",
                                            "TOTAL_PLAYTIME_SECONDS",
                                            "SESSIONS_COUNT",
                                            "PENALTY_COUNT",
                                            "SERVER_PLAYER_COUNT",
                                            "TEAM_PLAYER_COUNT",
                                            "MAP_NAME",
                                            "MATCH_TIME_REMAINING",
                                        ],
                                        "required": True,
                                    },
                                    "operator": {
                                        "type": "string",
                                        "description": "Comparison operator",
                                        "enum": [
                                            "EQUAL",
                                            "NOT_EQUAL",
                                            "GREATER_THAN",
                                            "GREATER_THAN_OR_EQUAL",
                                            "LESS_THAN",
                                            "LESS_THAN_OR_EQUAL",
                                            "CONTAINS",
                                            "NOT_CONTAINS",
                                            "STARTS_WITH",
                                            "ENDS_WITH",
                                            "REGEX_MATCH",
                                        ],
                                        "required": True,
                                    },
                                    "value": {
                                        "type": "any",
                                        "description": "Value to compare against",
                                        "required": True,
                                    },
                                },
                            },
                        },
                        "actions": {
                            "type": "array",
                            "description": "Actions to execute when conditions are met",
                            "required": True,
                            "items": {
                                "type": "object",
                                "properties": {
                                    "action_type": {
                                        "type": "string",
                                        "description": "Type of action to perform",
                                        "enum": [
                                            "MESSAGE_PLAYER",
                                            "MESSAGE_ALL_PLAYERS",
                                            "KICK_PLAYER",
                                            "PUNISH_PLAYER",
                                            "TEMP_BAN_PLAYER",
                                            "PERMA_BAN_PLAYER",
                                            "ADD_PLAYER_FLAG",
                                            "REMOVE_PLAYER_FLAG",
                                            "ADD_TO_WATCHLIST",
                                            "BROADCAST_MESSAGE",
                                            "TEMPORARY_BROADCAST",
                                            "SEND_DISCORD_WEBHOOK",
                                            "SWITCH_PLAYER_TEAM",
                                        ],
                                        "required": True,
                                    },
                                    "parameters": {
                                        "type": "object",
                                        "description": "Action-specific parameters (e.g., message, reason, duration)",
                                    },
                                },
                            },
                        },
                        "cooldown_seconds": {
                            "type": "integer",
                            "description": "Minimum seconds between executions for the same player",
                            "default": 0,
                        },
                        "max_executions_per_player": {
                            "type": "integer",
                            "description": "Maximum times this rule can execute per player (0 = unlimited)",
                            "default": 0,
                        },
                    },
                },
            },
        }
        
        result = {
            "description": "Conditional Actions Configuration - Create rules that automatically execute actions based on player/game conditions",
            "schema": config_description,
            "examples": [
                {
                    "name": "Welcome High Level Players",
                    "description": "Send a welcome message to players level 100+",
                    "enabled": True,
                    "trigger_event": "PLAYER_CONNECTED",
                    "logical_operator": "AND",
                    "conditions": [
                        {
                            "field": "PLAYER_LEVEL",
                            "operator": "GREATER_THAN_OR_EQUAL",
                            "value": 100,
                        }
                    ],
                    "actions": [
                        {
                            "action_type": "MESSAGE_PLAYER",
                            "parameters": {
                                "message": "Welcome back, veteran! Thanks for playing on our server."
                            },
                        }
                    ],
                    "cooldown_seconds": 3600,
                    "max_executions_per_player": 1,
                },
                {
                    "name": "Auto-kick High Teamkillers",
                    "description": "Kick players with 5+ teamkills in current match",
                    "enabled": True,
                    "trigger_event": "PLAYER_TEAM_KILL",
                    "logical_operator": "AND",
                    "conditions": [
                        {
                            "field": "TEAMKILLS",
                            "operator": "GREATER_THAN_OR_EQUAL",
                            "value": 5,
                        }
                    ],
                    "actions": [
                        {
                            "action_type": "KICK_PLAYER",
                            "parameters": {
                                "reason": "Excessive teamkilling (5+ TKs)"
                            },
                        }
                    ],
                    "cooldown_seconds": 0,
                    "max_executions_per_player": 1,
                },
            ],
        }
        
    except Exception as e:
        failed = True
        error = str(e)
        result = None
    
    return api_response(
        result=result,
        command="describe_conditional_actions_config",
        arguments={},
        failed=failed,
        error=error,
    )

