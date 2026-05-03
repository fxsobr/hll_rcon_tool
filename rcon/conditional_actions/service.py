import logging
import time

from rcon.cache_utils import get_redis_client
from rcon.conditional_actions.processor import ConditionalActionsProcessor
from rcon.rcon import get_rcon
from rcon.user_config.conditional_actions import ConditionalActionsUserConfig, TriggerEvent

logger = logging.getLogger(__name__)

CHECK_INTERVAL = 10  # seconds


def run():
    """Main loop for the conditional actions supervisor service.

    Publishes the enabled state to Redis (for hooks), processes PERIODIC trigger rules,
    and records a heartbeat for monitoring.
    """
    logger.info("Starting conditional actions service")
    rcon = get_rcon()
    red = get_redis_client()

    while True:
        try:
            config = ConditionalActionsUserConfig.load_from_db()

            # Publish enabled state to Redis for hooks
            red.set("conditional_actions:enabled", "1" if config.enabled else "0", ex=30)

            if not config.enabled:
                time.sleep(CHECK_INTERVAL)
                continue

            # Process PERIODIC rules
            periodic_rules = [
                r for r in config.rules
                if r.enabled and r.trigger_event == TriggerEvent.PERIODIC
            ]
            periodic_rules.sort(key=lambda r: r.priority, reverse=True)

            if periodic_rules:
                processor = ConditionalActionsProcessor(rcon)
                for rule in periodic_rules:
                    try:
                        last_run_key = f"conditional_action:periodic:{rule.id}"
                        last_run = red.get(last_run_key)

                        if last_run and (time.time() - float(last_run)) < rule.trigger_interval_seconds:
                            continue

                        logger.info("Running periodic rule: %s", rule.name)
                        processor.invalidate_cache()
                        players = processor._get_players()
                        gamestate = processor._get_gamestate()

                        for player_id, player_info in players.get("players", {}).items():
                            try:
                                processor.process_rule(rule, player_id, player_info, gamestate)
                            except Exception:
                                logger.exception(
                                    "Error processing periodic rule %s for player %s",
                                    rule.name, player_id,
                                )

                        red.set(last_run_key, str(time.time()), ex=rule.trigger_interval_seconds * 2)
                    except Exception:
                        logger.exception("Error in periodic rule %s", rule.name)

            # Heartbeat
            red.set("conditional_actions:heartbeat", str(time.time()), ex=30)

        except Exception:
            logger.exception("Conditional actions service error")

        time.sleep(CHECK_INTERVAL)
