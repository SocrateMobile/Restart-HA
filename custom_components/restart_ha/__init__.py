"""Custom integration: Restart HA.

Provides a left sidebar panel with a restart popin dialog, orchestration of all
updates (integrations, themes, add-ons, core) with item and global progress bars,
temporary interception of automatic restarts, and sidebar badge MAJ mechanism.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

import voluptuous as vol

from homeassistant.components import frontend, websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers.typing import ConfigType

from .const import (
    ACTION_CANCEL,
    ACTION_QUICK_RESTART,
    ACTION_SYSTEM_RESTART,
    DOMAIN,
    FRONTEND_FILE_NAME,
    FRONTEND_URL_PATH,
    NAME,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL_PATH,
    VERSION,
    WS_EVENT_PROGRESS,
    WS_TYPE_ABORT_PROCESS,
    WS_TYPE_GET_STATUS,
    WS_TYPE_START_PROCESS,
)

_LOGGER = logging.getLogger(__name__)


class RestartOrchestrator:
    """Manages sequential updates and safe restarts."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the orchestrator."""
        self.hass = hass
        self.is_running: bool = False
        self.current_action: str | None = None
        self.total_updates: int = 0
        self.current_index: int = 0
        self.current_entity_id: str | None = None
        self.current_entity_name: str | None = None
        self.current_entity_progress: int = 0
        self.global_progress: int = 0
        self.status_message: str = ""
        self.errors: list[str] = []
        self.is_blocking_restarts: bool = False
        self.restart_intercepted: bool = False
        self._original_restart_handler: Any = None
        self._task: asyncio.Task | None = None

    def get_available_updates(self) -> list[dict[str, Any]]:
        """Get all update.* entities that have pending updates."""
        updates: list[dict[str, Any]] = []
        for state in self.hass.states.async_all("update"):
            attrs = state.attributes
            is_avail = (
                state.state == "on"
                or attrs.get("update_available") is True
                or (
                    attrs.get("latest_version")
                    and attrs.get("installed_version")
                    and attrs.get("latest_version") != attrs.get("installed_version")
                )
            )
            if is_avail:
                updates.append(
                    {
                        "entity_id": state.entity_id,
                        "name": attrs.get("friendly_name") or state.entity_id,
                        "title": attrs.get("title") or attrs.get("friendly_name") or state.entity_id,
                        "installed_version": attrs.get("installed_version") or "Inconnue",
                        "latest_version": attrs.get("latest_version") or "Nouvelle version",
                        "release_summary": attrs.get("release_summary"),
                        "entity_picture": attrs.get("entity_picture"),
                        "in_progress": attrs.get("in_progress", False),
                        "update_percentage": attrs.get("update_percentage"),
                    }
                )
        return updates

    def get_status_dict(self) -> dict[str, Any]:
        """Return the current status as a dictionary."""
        return {
            "is_running": self.is_running,
            "current_action": self.current_action,
            "total_updates": self.total_updates,
            "current_index": self.current_index,
            "current_entity_id": self.current_entity_id,
            "current_entity_name": self.current_entity_name,
            "current_entity_progress": self.current_entity_progress,
            "global_progress": self.global_progress,
            "status_message": self.status_message,
            "restart_intercepted": self.restart_intercepted,
            "errors": self.errors,
            "available_updates": self.get_available_updates(),
        }

    def broadcast_progress(self) -> None:
        """Broadcast status update to websocket subscribers."""
        self.hass.bus.async_fire(WS_EVENT_PROGRESS, self.get_status_dict())

    def enable_restart_interception(self) -> None:
        """Intercept calls to homeassistant.restart to prevent premature reboot."""
        if self.is_blocking_restarts:
            return

        self.is_blocking_restarts = True
        self.restart_intercepted = False

        if self.hass.services.has_service("homeassistant", "restart"):
            service_desc = self.hass.services._services.get("homeassistant", {}).get("restart")
            if service_desc and hasattr(service_desc, "job"):
                self._original_restart_handler = service_desc.job

                async def intercepted_restart(call: ServiceCall) -> None:
                    if self.is_blocking_restarts:
                        _LOGGER.warning(
                            "Intercepted automatic restart from update component; "
                            "delaying restart until all updates complete."
                        )
                        self.restart_intercepted = True
                        self.status_message = (
                            "Redémarrage automatique intercepté et mis en attente..."
                        )
                        self.broadcast_progress()
                        return

                    if self._original_restart_handler:
                        target = self._original_restart_handler.target
                        if asyncio.iscoroutinefunction(target):
                            await target(call)
                        else:
                            await self.hass.async_add_executor_job(target, call)

                self.hass.services.async_register(
                    "homeassistant", "restart", intercepted_restart
                )
                _LOGGER.info("Restart HA: Interception of homeassistant.restart enabled.")

    def disable_restart_interception(self) -> None:
        """Restore original homeassistant.restart service handler."""
        self.is_blocking_restarts = False
        if self._original_restart_handler and hasattr(self._original_restart_handler, "target"):
            self.hass.services.async_register(
                "homeassistant", "restart", self._original_restart_handler.target
            )
            _LOGGER.info("Restart HA: Original homeassistant.restart service restored.")
            self._original_restart_handler = None

    async def execute_restart_action(self, action: str) -> None:
        """Execute the final restart or action."""
        if action == ACTION_QUICK_RESTART:
            _LOGGER.info("Restart HA: Performing Quick Restart (homeassistant.restart)...")
            await self.hass.services.async_call("homeassistant", "restart")
        elif action == ACTION_SYSTEM_RESTART:
            _LOGGER.info("Restart HA: Performing System Reboot...")
            if self.hass.services.has_service("hassio", "host_reboot"):
                await self.hass.services.async_call("hassio", "host_reboot")
            else:
                _LOGGER.info("hassio.host_reboot not found; falling back to homeassistant.restart")
                await self.hass.services.async_call("homeassistant", "restart")
        elif action == ACTION_CANCEL:
            _LOGGER.info("Restart HA: Action is Cancel; no restart performed.")

    def start_process(
        self,
        action: str,
        update_all: bool = False,
        entity_ids: list[str] | None = None,
    ) -> None:
        """Start the requested action or update pipeline in background."""
        if self.is_running:
            raise RuntimeError("A restart/update process is already in progress.")

        if not update_all:
            # Immediate action without updates
            self.hass.async_create_task(self.execute_restart_action(action))
            return

        self.is_running = True
        self.current_action = action
        self.errors = []
        self.current_index = 0
        self.current_entity_progress = 0
        self.global_progress = 0
        self.status_message = "Préparation des mises à jour..."
        self.broadcast_progress()

        self._task = self.hass.async_create_task(
            self._run_update_pipeline(action, entity_ids)
        )

    async def _run_update_pipeline(
        self, action: str, entity_ids: list[str] | None
    ) -> None:
        """Sequential execution of updates with restart interception."""
        self.enable_restart_interception()
        try:
            # Get list of targets
            if entity_ids:
                targets = entity_ids
            else:
                available = self.get_available_updates()
                targets = [item["entity_id"] for item in available]

            self.total_updates = len(targets)
            if self.total_updates == 0:
                self.status_message = "Aucune mise à jour en attente."
                self.global_progress = 100
                self.broadcast_progress()
                await asyncio.sleep(1)
            else:
                for idx, eid in enumerate(targets):
                    self.current_index = idx + 1
                    self.current_entity_id = eid
                    st = self.hass.states.get(eid)
                    self.current_entity_name = (
                        (st.attributes.get("friendly_name") or eid) if st else eid
                    )
                    self.current_entity_progress = 10
                    self.global_progress = int((idx / self.total_updates) * 100)
                    self.status_message = (
                        f"Mise à jour de {self.current_entity_name} ({self.current_index}/{self.total_updates})..."
                    )
                    self.broadcast_progress()

                    _LOGGER.info(
                        "Restart HA: Starting update for %s (%s)",
                        eid,
                        self.current_entity_name,
                    )

                    # Trigger update.install
                    try:
                        await self.hass.services.async_call(
                            "update",
                            "install",
                            {"entity_id": eid, "backup": False},
                            blocking=False,
                        )
                    except Exception as err:
                        _LOGGER.error("Restart HA: Error calling update.install on %s: %s", eid, err)
                        self.errors.append(f"{eid}: {err}")
                        continue

                    # Wait for completion of this entity (max 300 seconds)
                    wait_seconds = 0
                    entity_completed = False
                    while wait_seconds < 300:
                        await asyncio.sleep(1.5)
                        wait_seconds += 2
                        cur_st = self.hass.states.get(eid)
                        if not cur_st:
                            break

                        pct = cur_st.attributes.get("update_percentage")
                        if pct is not None:
                            self.current_entity_progress = max(10, min(95, int(pct)))
                            self.broadcast_progress()

                        in_progress = cur_st.attributes.get("in_progress", False)
                        inst_v = cur_st.attributes.get("installed_version")
                        lat_v = cur_st.attributes.get("latest_version")
                        state_val = cur_st.state

                        if not in_progress:
                            # If it finished or state is off or versions match
                            if state_val == "off" or (inst_v and lat_v and inst_v == lat_v) or wait_seconds >= 6:
                                entity_completed = True
                                break

                    self.current_entity_progress = 100
                    self.global_progress = int(((idx + 1) / self.total_updates) * 100)
                    self.status_message = f"{self.current_entity_name} mis à jour avec succès !"
                    self.broadcast_progress()
                    await asyncio.sleep(0.8)

            self.status_message = "Toutes les mises à jour sont terminées !"
            self.global_progress = 100
            self.broadcast_progress()
            await asyncio.sleep(1.5)

        except Exception as exc:
            _LOGGER.error("Restart HA: Pipeline failed with error: %s", exc, exc_info=True)
            self.errors.append(str(exc))
            self.status_message = f"Erreur lors des mises à jour : {exc}"
            self.broadcast_progress()
        finally:
            self.disable_restart_interception()
            self.is_running = False

            # Perform final action
            if action == ACTION_CANCEL:
                _LOGGER.info("Restart HA: Updates finished, action is Cancel: returning without restart.")
                self.status_message = "Mises à jour terminées. Redémarrage annulé."
                self.broadcast_progress()
            elif action == ACTION_QUICK_RESTART or (action != ACTION_CANCEL and self.restart_intercepted):
                self.status_message = "Redémarrage de Home Assistant en cours..."
                self.broadcast_progress()
                await asyncio.sleep(1)
                await self.execute_restart_action(ACTION_QUICK_RESTART)
            elif action == ACTION_SYSTEM_RESTART:
                self.status_message = "Redémarrage du système complet en cours..."
                self.broadcast_progress()
                await asyncio.sleep(1)
                await self.execute_restart_action(ACTION_SYSTEM_RESTART)

    def abort_process(self) -> None:
        """Abort currently running process."""
        if self._task and not self._task.done():
            self._task.cancel()
        self.disable_restart_interception()
        self.is_running = False
        self.status_message = "Processus interrompu."
        self.broadcast_progress()


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the Restart HA component from configuration.yaml."""
    return await _async_setup_common(hass)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Restart HA from a config entry."""
    return await _async_setup_common(hass)


async def _async_setup_common(hass: HomeAssistant) -> bool:
    """Common setup logic for Restart HA."""
    if DOMAIN in hass.data:
        return True

    orchestrator = RestartOrchestrator(hass)
    hass.data[DOMAIN] = {"orchestrator": orchestrator}

    # Register frontend static path
    frontend_path = os.path.join(os.path.dirname(__file__), "frontend")
    hass.http.register_static_path(
        FRONTEND_URL_PATH,
        frontend_path,
        cache_headers=False,
    )

    # Register left sidebar built-in custom panel
    frontend.async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path=PANEL_URL_PATH,
        config={
            "_panel_custom": {
                "name": "restart-ha-panel",
                "module_url": f"{FRONTEND_URL_PATH}/{FRONTEND_FILE_NAME}?v={VERSION}",
            }
        },
        require_admin=False,
        update=True,
    )

    # Register WebSocket Commands
    @websocket_api.websocket_command({vol.Required("type"): WS_TYPE_GET_STATUS})
    @callback
    def ws_get_status(
        hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
    ) -> None:
        connection.send_result(msg["id"], orchestrator.get_status_dict())

    @websocket_api.websocket_command(
        {
            vol.Required("type"): WS_TYPE_START_PROCESS,
            vol.Required("action"): vol.In(
                [ACTION_QUICK_RESTART, ACTION_SYSTEM_RESTART, ACTION_CANCEL]
            ),
            vol.Optional("update_all", default=False): bool,
            vol.Optional("entity_ids"): [str],
        }
    )
    def ws_start_process(
        hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
    ) -> None:
        try:
            orchestrator.start_process(
                action=msg["action"],
                update_all=msg.get("update_all", False),
                entity_ids=msg.get("entity_ids"),
            )
            connection.send_result(msg["id"], {"status": "started"})
        except Exception as err:
            connection.send_error(msg["id"], "start_failed", str(err))

    @websocket_api.websocket_command({vol.Required("type"): WS_TYPE_ABORT_PROCESS})
    def ws_abort_process(
        hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
    ) -> None:
        orchestrator.abort_process()
        connection.send_result(msg["id"], {"status": "aborted"})

    websocket_api.async_register_command(hass, ws_get_status)
    websocket_api.async_register_command(hass, ws_start_process)
    websocket_api.async_register_command(hass, ws_abort_process)

    # Register HA Services
    async def handle_quick_restart(call: ServiceCall) -> None:
        update_all = call.data.get("update_all", False)
        orchestrator.start_process(ACTION_QUICK_RESTART, update_all=update_all)

    async def handle_system_restart(call: ServiceCall) -> None:
        update_all = call.data.get("update_all", False)
        orchestrator.start_process(ACTION_SYSTEM_RESTART, update_all=update_all)

    async def handle_update_all(call: ServiceCall) -> None:
        action = call.data.get("action", ACTION_QUICK_RESTART)
        orchestrator.start_process(action, update_all=True)

    hass.services.async_register(DOMAIN, "quick_restart", handle_quick_restart)
    hass.services.async_register(DOMAIN, "system_restart", handle_system_restart)
    hass.services.async_register(DOMAIN, "update_all", handle_update_all)

    _LOGGER.info("Restart HA integration successfully initialized (v%s)", VERSION)
    return True
