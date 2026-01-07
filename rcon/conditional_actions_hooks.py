import logging

from rcon.conditional_actions_processor import ConditionalActionsProcessor
from rcon.logs.loop import (
    on_connected,
    on_disconnected,
    on_kill,
    on_match_end,
    on_match_start,
    on_tk,
)
from rcon.rcon import Rcon, StructuredLogLineWithMetaData
from rcon.user_config.conditional_actions import TriggerEvent

logger = logging.getLogger(__name__)


@on_connected()
def conditional_actions_on_connected(rcon: Rcon, struct_log: StructuredLogLineWithMetaData):
    """Trigger conditional actions when a player connects"""
    try:
        player_id = struct_log.get("player_id_1")
        if not player_id:
            return
        
        processor = ConditionalActionsProcessor(rcon)
        processor.process_event(
            trigger_event=TriggerEvent.PLAYER_CONNECTED.value,
            player_id=player_id,
            struct_log=struct_log,
        )
    except Exception as e:
        logger.error(f"Error in conditional_actions_on_connected: {e}")


@on_disconnected
def conditional_actions_on_disconnected(rcon: Rcon, struct_log: StructuredLogLineWithMetaData):
    """Trigger conditional actions when a player disconnects"""
    try:
        player_id = struct_log.get("player_id_1")
        if not player_id:
            return
        
        processor = ConditionalActionsProcessor(rcon)
        processor.process_event(
            trigger_event=TriggerEvent.PLAYER_DISCONNECTED.value,
            player_id=player_id,
            struct_log=struct_log,
        )
    except Exception as e:
        logger.error(f"Error in conditional_actions_on_disconnected: {e}")


@on_kill
def conditional_actions_on_kill(rcon: Rcon, struct_log: StructuredLogLineWithMetaData):
    """Trigger conditional actions when a player gets a kill"""
    try:
        player_id = struct_log.get("player_id_1")  # Killer
        if not player_id:
            return
        
        processor = ConditionalActionsProcessor(rcon)
        processor.process_event(
            trigger_event=TriggerEvent.PLAYER_KILL.value,
            player_id=player_id,
            struct_log=struct_log,
        )
        
        victim_id = struct_log.get("player_id_2")
        if victim_id:
            processor.process_event(
                trigger_event=TriggerEvent.PLAYER_DEATH.value,
                player_id=victim_id,
                struct_log=struct_log,
            )
    except Exception as e:
        logger.error(f"Error in conditional_actions_on_kill: {e}")


@on_tk
def conditional_actions_on_teamkill(rcon: Rcon, struct_log: StructuredLogLineWithMetaData):
    """Trigger conditional actions when a player teamkills"""
    try:
        player_id = struct_log.get("player_id_1")  # Teamkiller
        if not player_id:
            return
        
        processor = ConditionalActionsProcessor(rcon)
        processor.process_event(
            trigger_event=TriggerEvent.PLAYER_TEAM_KILL.value,
            player_id=player_id,
            struct_log=struct_log,
        )
    except Exception as e:
        logger.error(f"Error in conditional_actions_on_teamkill: {e}")


@on_match_start
def conditional_actions_on_match_start(rcon: Rcon, struct_log: StructuredLogLineWithMetaData):
    """Trigger conditional actions when a match starts"""
    try:
        logger.info("Match started - conditional actions could be triggered here")

        try:
            players = rcon.get_detailed_players()
            processor = ConditionalActionsProcessor(rcon)
            
            for player_id in players.get("players", {}).keys():
                processor.process_event(
                    trigger_event=TriggerEvent.MATCH_START.value,
                    player_id=player_id,
                    struct_log=struct_log,
                )
        except Exception as e:
            logger.error(f"Error processing match start for players: {e}")
            
    except Exception as e:
        logger.error(f"Error in conditional_actions_on_match_start: {e}")


@on_match_end
def conditional_actions_on_match_end(rcon: Rcon, struct_log: StructuredLogLineWithMetaData):
    """Trigger conditional actions when a match ends"""
    try:
        try:
            players = rcon.get_detailed_players()
            processor = ConditionalActionsProcessor(rcon)
            
            for player_id in players.get("players", {}).keys():
                processor.process_event(
                    trigger_event=TriggerEvent.MATCH_END.value,
                    player_id=player_id,
                    struct_log=struct_log,
                )
        except Exception as e:
            logger.error(f"Error processing match end for players: {e}")
            
    except Exception as e:
        logger.error(f"Error in conditional_actions_on_match_end: {e}")

