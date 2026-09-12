"""Custom integration: Restart HA.

Provides a left sidebar panel with a restart popin dialog, orchestration of all
updates (integrations, themes, add-ons, core) with item and global progress bars,
temporary interception of automatic restarts, selective item updates, and sidebar badge MAJ mechanism.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

import voluptuous as vol

from homeassistant.components import frontend, websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.typing import ConfigType

try:
    from homeassistant.core import HassJob
except ImportError:
    HassJob = None  # type: ignore[misc,assignment]

try:
    from homeassistant.components.http import StaticPathConfig
except ImportError:
    StaticPathConfig = None  # type: ignore[misc,assignment]

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

PLATFORMS: list[str] = ["update"]


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
        self._original_restart_job: Any = None
        self._task: asyncio.Task | None = None

    def get_available_updates(self) -> list[dict[str, Any]]:
        """Get all update.* entities that have pending updates."""
        updates: list[dict[str, Any]] = []
        try:
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
                            "title": (
                                attrs.get("title")
                                or attrs.get("friendly_name")
                                or state.entity_id
                            ),
                            "installed_version": attrs.get("installed_version") or "Inconnue",
                            "latest_version": attrs.get("latest_version") or "Nouvelle version",
                            "release_summary": attrs.get("release_summary"),
                            "entity_picture": attrs.get("entity_picture"),
                            "in_progress": attrs.get("in_progress", False),
                            "update_percentage": attrs.get("update_percentage"),
                        }
                    )
        except Exception as err:
            _LOGGER.debug("Error scanning update entities: %s", err)
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
        try:
            self.hass.bus.async_fire(WS_EVENT_PROGRESS, self.get_status_dict())
        except Exception:
            pass

    def enable_restart_interception(self) -> None:
        """Intercept calls to homeassistant.restart to prevent premature reboot."""
        if self.is_blocking_restarts:
            return

        self.is_blocking_restarts = True
        self.restart_intercepted = False

        try:
            services_dict = getattr(self.hass.services, "_services", {})
            ha_services = services_dict.get("homeassistant", {})
            service_desc = ha_services.get("restart")
            if service_desc and hasattr(service_desc, "job"):
                # Save the real handler ONCE and never forget it
                if self._original_restart_job is None:
                    self._original_restart_job = service_desc.job

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

                    # Not blocking: execute real handler
                    if self._original_restart_job:
                        target = self._original_restart_job.target
                        if asyncio.iscoroutinefunction(target):
                            await target(call)
                        else:
                            await self.hass.async_add_executor_job(target, call)

                if HassJob is not None:
                    service_desc.job = HassJob(intercepted_restart)
                elif hasattr(service_desc.job, "target"):
                    service_desc.job.target = intercepted_restart

                _LOGGER.info("Restart HA: Interception of homeassistant.restart enabled.")
        except Exception as err:
            _LOGGER.warning("Restart HA: Could not intercept restart service: %s", err)

    def disable_restart_interception(self) -> None:
        """Restore original homeassistant.restart service handler."""
        self.is_blocking_restarts = False
        try:
            services_dict = getattr(self.hass.services, "_services", {})
            ha_services = services_dict.get("homeassistant", {})
            service_desc = ha_services.get("restart")
            if service_desc and self._original_restart_job is not None:
                service_desc.job = self._original_restart_job
                _LOGGER.info("Restart HA: Original homeassistant.restart service restored.")
        except Exception as err:
            _LOGGER.warning("Restart HA: Could not restore restart service: %s", err)

    async def execute_restart_action(self, action: str) -> None:
        """Execute the final restart or action."""
        self.disable_restart_interception()

        if action == ACTION_QUICK_RESTART:
            _LOGGER.info("Restart HA: Executing Quick Restart...")
            try:
                if self.hass.services.has_service("hassio", "homeassistant_restart"):
                    await self.hass.services.async_call("hassio", "homeassistant_restart", blocking=False)
                elif self.hass.services.has_service("homeassistant", "restart"):
                    await self.hass.services.async_call("homeassistant", "restart", blocking=False)
            except Exception as err:
                _LOGGER.warning("Error calling quick restart service: %s", err)
                try:
                    await self.hass.services.async_call("homeassistant", "restart", blocking=False)
                except Exception:
                    pass

        elif action == ACTION_SYSTEM_RESTART:
            _LOGGER.info("Restart HA: Executing System Reboot...")
            try:
                if self.hass.services.has_service("hassio", "host_reboot"):
                    await self.hass.services.async_call("hassio", "host_reboot", blocking=False)
                elif self.hass.services.has_service("homeassistant", "restart"):
                    await self.hass.services.async_call("homeassistant", "restart", blocking=False)
            except Exception as err:
                _LOGGER.warning("Error calling system reboot service: %s", err)
                try:
                    await self.hass.services.async_call("homeassistant", "restart", blocking=False)
                except Exception:
                    pass

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

        # If no updates requested, or empty selection passed
        if not update_all or (entity_ids is not None and len(entity_ids) == 0):
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
        """Sequential execution of updates with continuous smooth progress calculation."""
        self.enable_restart_interception()
        try:
            if entity_ids is not None:
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
                    self.current_entity_progress = 5
                    self.global_progress = int(
                        ((idx + (self.current_entity_progress / 100.0)) / self.total_updates)
                        * 100
                    )
                    self.status_message = (
                        f"Mise à jour de {self.current_entity_name} ({self.current_index}/{self.total_updates})..."
                    )
                    self.broadcast_progress()

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

                    wait_seconds = 0
                    simulated_pct = 10
                    while wait_seconds < 300:
                        await asyncio.sleep(1.5)
                        wait_seconds += 2
                        cur_st = self.hass.states.get(eid)
                        if not cur_st:
                            break

                        pct = cur_st.attributes.get("update_percentage")
                        if pct is not None:
                            self.current_entity_progress = max(5, min(95, int(pct)))
                        else:
                            simulated_pct = min(90, simulated_pct + 4)
                            self.current_entity_progress = simulated_pct

                        self.global_progress = int(
                            ((idx + (self.current_entity_progress / 100.0)) / self.total_updates)
                            * 100
                        )
                        self.broadcast_progress()

                        in_progress = cur_st.attributes.get("in_progress", False)
                        inst_v = cur_st.attributes.get("installed_version")
                        lat_v = cur_st.attributes.get("latest_version")
                        state_val = cur_st.state

                        if not in_progress:
                            if (
                                state_val == "off"
                                or (inst_v and lat_v and inst_v == lat_v)
                                or wait_seconds >= 8
                            ):
                                break

                    self.current_entity_progress = 100
                    self.global_progress = int(((idx + 1) / self.total_updates) * 100)
                    self.status_message = f"{self.current_entity_name} mis à jour avec succès !"
                    self.broadcast_progress()
                    await asyncio.sleep(0.8)

            self.status_message = "Toutes les mises à jour sont terminées !"
            self.global_progress = 100
            self.broadcast_progress()
            await asyncio.sleep(1.2)

        except Exception as exc:
            _LOGGER.error("Restart HA: Pipeline failed with error: %s", exc, exc_info=True)
            self.errors.append(str(exc))
            self.status_message = f"Erreur lors des mises à jour : {exc}"
            self.broadcast_progress()
        finally:
            self.disable_restart_interception()
            self.is_running = False

            if action == ACTION_CANCEL:
                _LOGGER.info("Restart HA: Updates finished, action is Cancel: returning without restart.")
                self.status_message = "Mises à jour terminées. Redémarrage annulé."
                self.broadcast_progress()
            elif action == ACTION_SYSTEM_RESTART:
                self.status_message = "Redémarrage du système complet en cours..."
                self.broadcast_progress()
                await asyncio.sleep(1)
                await self.execute_restart_action(ACTION_SYSTEM_RESTART)
            elif action == ACTION_QUICK_RESTART or self.restart_intercepted:
                self.status_message = "Redémarrage de Home Assistant en cours..."
                self.broadcast_progress()
                await asyncio.sleep(1)
                await self.execute_restart_action(ACTION_QUICK_RESTART)

    def abort_process(self) -> None:
        """Abort currently running process."""
        if self._task and not self._task.done():
            self._task.cancel()
        self.disable_restart_interception()
        self.is_running = False
        self.status_message = "Processus interrompu."
        self.broadcast_progress()


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up Restart HA from configuration.yaml (optional)."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Restart HA from a config entry."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    entry_data = domain_data.setdefault(entry.entry_id, {})

    orchestrator = domain_data.get("orchestrator")
    if not orchestrator:
        orchestrator = RestartOrchestrator(hass)
        domain_data["orchestrator"] = orchestrator

    entry_data["orchestrator"] = orchestrator
    entry_data["entry"] = entry

    # 1. Register static path for frontend
    frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")
    if os.path.exists(frontend_dir):
        if hasattr(hass.http, "async_register_static_paths") and StaticPathConfig is not None:
            await hass.http.async_register_static_paths(
                [StaticPathConfig(FRONTEND_URL_PATH, frontend_dir, cache_headers=False)]
            )
        elif hasattr(hass.http, "register_static_path"):
            try:
                hass.http.register_static_path(
                    FRONTEND_URL_PATH,
                    frontend_dir,
                    cache_headers=False,
                )
            except Exception:
                pass

    # 2. Register left sidebar custom panel
    try:
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
    except TypeError:
        try:
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
            )
        except Exception as err:
            _LOGGER.debug("Could not register sidebar panel: %s", err)
    except Exception as err:
        _LOGGER.debug("Could not register sidebar panel: %s", err)

    # 3. Register WebSocket Commands (idempotent)
    if not domain_data.get("_ws_registered"):
        domain_data["_ws_registered"] = True
        _register_websocket_commands(hass, orchestrator)

    # 4. Register Services (idempotent)
    if not domain_data.get("_services_registered"):
        domain_data["_services_registered"] = True
        _register_services(hass, orchestrator)

    # 5. Forward setup to platforms (update platform)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    entry.async_on_unload(entry.add_update_listener(async_reload_entry))
    _LOGGER.info("Restart HA integration successfully set up (v%s)", VERSION)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return unload_ok


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload config entry."""
    await async_unload_entry(hass, entry)
    await async_setup_entry(hass, entry)


def _register_websocket_commands(
    hass: HomeAssistant, orchestrator: RestartOrchestrator
) -> None:
    """Register WebSocket API commands."""

    @websocket_api.websocket_command({vol.Required("type"): WS_TYPE_GET_STATUS})
    @websocket_api.async_response
    async def ws_get_status(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
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
    @websocket_api.async_response
    async def ws_start_process(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
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
    @websocket_api.async_response
    async def ws_abort_process(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        orchestrator.abort_process()
        connection.send_result(msg["id"], {"status": "aborted"})

    websocket_api.async_register_command(hass, ws_get_status)
    websocket_api.async_register_command(hass, ws_start_process)
    websocket_api.async_register_command(hass, ws_abort_process)


def _register_services(hass: HomeAssistant, orchestrator: RestartOrchestrator) -> None:
    """Register Home Assistant services."""

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
