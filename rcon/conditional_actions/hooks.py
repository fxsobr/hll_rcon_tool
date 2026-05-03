import logging
import time

from rcon.cache_utils import get_redis_client
from rcon.conditional_actions.processor import ConditionalActionsProcessor
from rcon.logs.loop import (
    on_chat,
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


def _is_enabled() -> bool:
    """Check Redis flag set by the service daemon."""
    try:
        red = get_redis_client()
        val = red.get("conditional_actions:enabled")
        return val == b"1"
    except Exception:
        return False


@on_connected()
def conditional_actions_on_connected(rcon: Rcon, struct_log: StructuredLogLineWithMetaData):
    try:
        if not _is_enabled():
            return
        player_id = struct_log.get("player_id_1")
        if not player_id:
            return
        time.sleep(5)
        processor = ConditionalActionsProcessor(rcon)
        processor.process_event(
            trigger_event=TriggerEvent.PLAYER_CONNECTED.value,
            player_id=player_id,
            struct_log=struct_log,
        )
    except Exception:
        logger.exception("Error in conditional_actions_on_connected")


@on_disconnected
def conditional_actions_on_disconnected(rcon: Rcon, struct_log: StructuredLogLineWithMetaData):
    try:
        if not _is_enabled():
            return
        player_id = struct_log.get("player_id_1")
        if not player_id:
            return
        processor = ConditionalActionsProcessor(rcon)
        processor.process_event(
            trigger_event=TriggerEvent.PLAYER_DISCONNECTED.value,
            player_id=player_id,
            struct_log=struct_log,
        )
    except Exception:
        logger.exception("Error in conditional_actions_on_disconnected")


@on_kill
def conditional_actions_on_kill(rcon: Rcon, struct_log: StructuredLogLineWithMetaData):
    try:
        if not _is_enabled():
            return
        player_id = struct_log.get("player_id_1")
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
    except Exception:
        logger.exception("Error in conditional_actions_on_kill")


@on_tk
def conditional_actions_on_teamkill(rcon: Rcon, struct_log: StructuredLogLineWithMetaData):
    try:
        if not _is_enabled():
            return
        player_id = struct_log.get("player_id_1")
        if not player_id:
            return
        processor = ConditionalActionsProcessor(rcon)
        processor.process_event(
            trigger_event=TriggerEvent.PLAYER_TEAM_KILL.value,
            player_id=player_id,
            struct_log=struct_log,
        )
    except Exception:
        logger.exception("Error in conditional_actions_on_teamkill")


@on_chat
def conditional_actions_on_chat(rcon: Rcon, struct_log: StructuredLogLineWithMetaData):
    try:
        if not _is_enabled():
            return
        player_id = struct_log.get("player_id_1")
        if not player_id:
            return
        message = struct_log.get("sub_content", "")
        scope = struct_log.get("content", "")
        processor = ConditionalActionsProcessor(rcon)
        processor.process_event(
            trigger_event=TriggerEvent.PLAYER_CHAT.value,
            player_id=player_id,
            struct_log=struct_log,
            context={"message_content": message, "message_scope": scope},
        )
    except Exception:
        logger.exception("Error in conditional_actions_on_chat")


@on_match_start
def conditional_actions_on_match_start(rcon: Rcon, struct_log: StructuredLogLineWithMetaData):
    try:
        if not _is_enabled():
            return
        processor = ConditionalActionsProcessor(rcon)
        processor.process_batch_event(
            trigger_event=TriggerEvent.MATCH_START.value,
            struct_log=struct_log,
        )
    except Exception:
        logger.exception("Error in conditional_actions_on_match_start")


@on_match_end
def conditional_actions_on_match_end(rcon: Rcon, struct_log: StructuredLogLineWithMetaData):
    try:
        if not _is_enabled():
            return
        processor = ConditionalActionsProcessor(rcon)
        processor.process_batch_event(
            trigger_event=TriggerEvent.MATCH_END.value,
            struct_log=struct_log,
        )
    except Exception:
        logger.exception("Error in conditional_actions_on_match_end")
