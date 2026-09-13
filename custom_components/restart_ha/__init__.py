"""Custom integration: Restart HA.

Provides a left sidebar panel with a restart popin dialog, orchestration of all
updates (integrations, themes, add-ons, core) with item and global progress bars,
temporary interception of automatic restarts, selective item updates, and sidebar badge MAJ mechanism.
"""
from __future__ import annotations

import asyncio
import datetime
import logging
import os
from typing import Any

import voluptuous as vol

from homeassistant.components import frontend, websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.storage import Store
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
    ACTION_SAFE_BOOT,
    ACTION_SCHEDULE_RESTART,
    DOMAIN,
    FRONTEND_FILE_NAME,
    FRONTEND_URL_PATH,
    NAME,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL_PATH,
    STORAGE_KEY,
    STORAGE_VERSION,
    VERSION,
    WS_EVENT_PROGRESS,
    WS_TYPE_ABORT_PROCESS,
    WS_TYPE_CANCEL_SCHEDULE,
    WS_TYPE_GET_STATUS,
    WS_TYPE_START_PROCESS,
)

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[str] = ["update"]


SCHEMA_RESTART = vol.Schema({vol.Optional("safe_mode", default=False): bool})


def _repair_restart_service_schema(hass: HomeAssistant) -> None:
    """Ensure homeassistant.restart has its valid schema so call.data['safe_mode'] never raises KeyError."""
    try:
        services_dict = getattr(hass.services, "_services", {})
        ha_services = services_dict.get("homeassistant", {})
        service_desc = ha_services.get("restart")
        if service_desc and getattr(service_desc, "schema", None) is None:
            service_desc.schema = SCHEMA_RESTART
            _LOGGER.info("Restart HA: Repaired missing schema for homeassistant.restart")
    except Exception as err:
        _LOGGER.debug("Could not repair homeassistant.restart schema: %s", err)


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
        self.scheduled_job: dict[str, Any] | None = None
        self._schedule_task: asyncio.Task | None = None
        self._store: Store | None = None

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
            "scheduled_job": self.scheduled_job,
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
                # Repair/ensure schema is never None
                if getattr(service_desc, "schema", None) is None:
                    service_desc.schema = SCHEMA_RESTART

                # Save the real handler ONCE and never save intercepted_restart as the original
                current_target = getattr(service_desc.job, "target", None)
                if self._original_restart_job is None:
                    if getattr(current_target, "__name__", "") != "intercepted_restart":
                        self._original_restart_job = service_desc.job

                async def intercepted_restart(call: ServiceCall) -> None:
                    # Guarantee safe_mode exists in call.data to prevent KeyError: 'safe_mode'
                    if hasattr(call, "data") and isinstance(call.data, dict):
                        call.data.setdefault("safe_mode", False)

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
                    else:
                        stop_handler = self.hass.data.get("homeassistant.stop_handler")
                        if stop_handler:
                            await stop_handler(self.hass, True)

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
            if service_desc:
                if getattr(service_desc, "schema", None) is None:
                    service_desc.schema = SCHEMA_RESTART
                if self._original_restart_job is not None:
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
                    await self.hass.services.async_call(
                        "homeassistant", "restart", {"safe_mode": False}, blocking=False
                    )
                else:
                    stop_handler = self.hass.data.get("homeassistant.stop_handler")
                    if stop_handler:
                        await stop_handler(self.hass, True)
            except Exception as err:
                _LOGGER.warning("Error calling quick restart service: %s", err)
                try:
                    await self.hass.services.async_call(
                        "homeassistant", "restart", {"safe_mode": False}, blocking=False
                    )
                except Exception:
                    stop_handler = self.hass.data.get("homeassistant.stop_handler")
                    if stop_handler:
                        await stop_handler(self.hass, True)

        elif action == ACTION_SAFE_BOOT:
            _LOGGER.info("Restart HA: Executing Safe Boot...")
            try:
                if self.hass.services.has_service("homeassistant", "restart"):
                    await self.hass.services.async_call(
                        "homeassistant", "restart", {"safe_mode": True}, blocking=False
                    )
                else:
                    _LOGGER.warning("Safe Boot not fully supported, falling back to quick restart")
                    stop_handler = self.hass.data.get("homeassistant.stop_handler")
                    if stop_handler:
                        await stop_handler(self.hass, True)
            except Exception as err:
                _LOGGER.warning("Error calling safe boot service: %s", err)
                stop_handler = self.hass.data.get("homeassistant.stop_handler")
                if stop_handler:
                    await stop_handler(self.hass, True)

        elif action == ACTION_SYSTEM_RESTART:
            _LOGGER.info("Restart HA: Executing System Reboot...")
            reboot_done = False
            try:
                hassio_comp = self.hass.data.get("hassio")
                if hassio_comp and hasattr(hassio_comp, "send_command"):
                    await hassio_comp.send_command("/host/reboot", method="post")
                    reboot_done = True
            except Exception as err:
                _LOGGER.debug("Could not call supervisor /host/reboot: %s", err)

            if not reboot_done and self.hass.services.has_service("hassio", "host_reboot"):
                try:
                    await self.hass.services.async_call("hassio", "host_reboot", blocking=False)
                    reboot_done = True
                except Exception as err:
                    _LOGGER.warning("Error calling system reboot service: %s", err)

            if not reboot_done:
                try:
                    if self.hass.services.has_service("homeassistant", "restart"):
                        await self.hass.services.async_call(
                            "homeassistant", "restart", {"safe_mode": False}, blocking=False
                        )
                    else:
                        stop_handler = self.hass.data.get("homeassistant.stop_handler")
                        if stop_handler:
                            await stop_handler(self.hass, True)
                except Exception as err:
                    _LOGGER.error("Error calling fallback restart: %s", err)

        elif action == ACTION_CANCEL:
            _LOGGER.info("Restart HA: Action is Cancel; no restart performed.")

    def calculate_next_schedule(
        self, schedule_time: str, schedule_day: int | str | None = None
    ) -> datetime.datetime | None:
        """Calculate the next target datetime for schedule_time (HH:MM) and optional schedule_day (0=Mon..6=Sun)."""
        now = datetime.datetime.now()
        try:
            parts = schedule_time.strip().split(":")
            target_hour = int(parts[0])
            target_minute = int(parts[1])
            if not (0 <= target_hour <= 23 and 0 <= target_minute <= 59):
                return None
        except Exception:
            return None

        norm_day: int | None = None
        if schedule_day not in (None, "", "-1", -1):
            try:
                norm_day = int(schedule_day)
                if not (0 <= norm_day <= 6):
                    norm_day = None
            except (ValueError, TypeError):
                norm_day = None

        candidate = now.replace(
            hour=target_hour, minute=target_minute, second=0, microsecond=0
        )

        if norm_day is None:
            # If no day specified: run at next occurrence of this HH:MM
            if candidate <= now:
                candidate += datetime.timedelta(days=1)
            return candidate
        else:
            # Specific weekday requested
            days_ahead = (norm_day - now.weekday()) % 7
            if days_ahead == 0 and candidate <= now:
                days_ahead = 7
            return candidate + datetime.timedelta(days=days_ahead)

    async def async_init_storage(self) -> None:
        """Load persisted schedule from Home Assistant Store on boot."""
        try:
            self._store = Store(self.hass, STORAGE_VERSION, STORAGE_KEY)
            stored = await self._store.async_load()
            if stored and isinstance(stored, dict) and stored.get("recurring"):
                _LOGGER.info("Restart HA: Restoring recurring schedule: %s", stored)
                self.schedule_process(
                    action=stored.get("action", ACTION_QUICK_RESTART),
                    update_all=stored.get("update_all", False),
                    entity_ids=stored.get("entity_ids"),
                    schedule_time=stored.get("schedule_time", "04:00"),
                    schedule_day=stored.get("schedule_day"),
                    recurring=True,
                )
        except Exception as err:
            _LOGGER.warning("Restart HA: Error initializing schedule store: %s", err)

    async def _save_schedule(self) -> None:
        """Save recurring schedule to store."""
        if not self._store:
            self._store = Store(self.hass, STORAGE_VERSION, STORAGE_KEY)
        if self.scheduled_job and self.scheduled_job.get("recurring"):
            try:
                await self._store.async_save(self.scheduled_job)
            except Exception as err:
                _LOGGER.warning("Restart HA: Could not save schedule: %s", err)

    async def _clear_schedule_store(self) -> None:
        """Clear schedule store."""
        if not self._store:
            self._store = Store(self.hass, STORAGE_VERSION, STORAGE_KEY)
        try:
            await self._store.async_remove()
        except Exception:
            pass

    async def cancel_schedule(self) -> None:
        """Cancel any active schedule."""
        if self._schedule_task and not self._schedule_task.done():
            self._schedule_task.cancel()
            self._schedule_task = None
        self.scheduled_job = None
        await self._clear_schedule_store()
        self.status_message = "Planification annulée."
        self.broadcast_progress()

    def schedule_process(
        self,
        action: str,
        update_all: bool = False,
        entity_ids: list[str] | None = None,
        schedule_time: str = "04:00",
        schedule_day: int | str | None = None,
        recurring: bool = False,
    ) -> None:
        """Schedule a restart or update+restart process."""
        if self._schedule_task and not self._schedule_task.done():
            self._schedule_task.cancel()
            self._schedule_task = None

        norm_day: int | None = None
        if schedule_day not in (None, "", "-1", -1):
            try:
                norm_day = int(schedule_day)
                if not (0 <= norm_day <= 6):
                    norm_day = None
            except (ValueError, TypeError):
                norm_day = None

        next_run = self.calculate_next_schedule(schedule_time, norm_day)
        if not next_run:
            raise ValueError(f"Invalid schedule time: {schedule_time}")

        self.scheduled_job = {
            "action": action,
            "update_all": update_all,
            "entity_ids": entity_ids,
            "schedule_time": schedule_time,
            "schedule_day": norm_day,
            "recurring": recurring,
            "next_run": next_run.isoformat(),
        }

        if recurring:
            self.hass.async_create_task(self._save_schedule())
        else:
            self.hass.async_create_task(self._clear_schedule_store())

        day_names = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
        day_str = f" ({day_names[norm_day]})" if norm_day is not None else ""
        rec_str = " - Récurrent" if recurring else ""
        upd_str = " (avec M.A.J)" if update_all else ""
        self.status_message = f"Planifié à {schedule_time}{day_str}{rec_str}{upd_str}"
        self.broadcast_progress()

        self._schedule_task = self.hass.async_create_task(self._run_schedule_loop())

    async def _run_schedule_loop(self) -> None:
        """Background loop waiting for scheduled execution time."""
        try:
            while self.scheduled_job:
                job = self.scheduled_job
                schedule_time = job["schedule_time"]
                schedule_day = job.get("schedule_day")
                recurring = job.get("recurring", False)
                action = job.get("action", ACTION_QUICK_RESTART)
                update_all = job.get("update_all", False)
                entity_ids = job.get("entity_ids")

                next_run = self.calculate_next_schedule(schedule_time, schedule_day)
                if not next_run:
                    break

                self.scheduled_job["next_run"] = next_run.isoformat()
                self.broadcast_progress()

                now = datetime.datetime.now()
                wait_seconds = (next_run - now).total_seconds()
                _LOGGER.info(
                    "Restart HA: Waiting for scheduled run at %s (%.1f seconds)",
                    next_run,
                    wait_seconds,
                )

                while wait_seconds > 0:
                    step = min(wait_seconds, 15)
                    await asyncio.sleep(step)
                    if not self.scheduled_job:
                        return
                    wait_seconds = (next_run - datetime.datetime.now()).total_seconds()

                _LOGGER.info(
                    "Restart HA: Executing scheduled job: action=%s, update_all=%s, recurring=%s",
                    action,
                    update_all,
                    recurring,
                )

                if not recurring:
                    self.scheduled_job = None
                    await self._clear_schedule_store()
                    self.broadcast_progress()

                if update_all:
                    await self._run_update_pipeline(action, entity_ids)
                else:
                    await self.execute_restart_action(action)

                if not recurring:
                    break
                else:
                    await asyncio.sleep(70)

        except asyncio.CancelledError:
            _LOGGER.debug("Restart HA: Schedule loop cancelled.")
        except Exception as err:
            _LOGGER.error("Restart HA: Error in schedule loop: %s", err, exc_info=True)

    def start_process(
        self,
        action: str,
        update_all: bool = False,
        entity_ids: list[str] | None = None,
        schedule_time: str | None = None,
        schedule_day: int | str | None = None,
        recurring: bool = False,
    ) -> None:
        """Start the requested action or schedule in background."""
        if schedule_time:
            self.schedule_process(
                action=action,
                update_all=update_all,
                entity_ids=entity_ids,
                schedule_time=schedule_time,
                schedule_day=schedule_day,
                recurring=recurring,
            )
            return

        # Immediate process
        if not update_all or (entity_ids is not None and len(entity_ids) == 0):
            self.hass.async_create_task(self.execute_restart_action(action))
            return

        if self.is_running:
            raise RuntimeError("A restart/update process is already in progress.")

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
        """Parallel execution of updates with watchdog support."""
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
                self.current_index = 0
                semaphore = asyncio.Semaphore(3)
                
                async def _update_single_entity(eid: str):
                    async with semaphore:
                        st = self.hass.states.get(eid)
                        entity_name = (st.attributes.get("friendly_name") or eid) if st else eid
                        self.status_message = f"Installation de {entity_name}..."
                        self.broadcast_progress()
                        
                        try:
                            await self.hass.services.async_call(
                                "update",
                                "install",
                                {"entity_id": eid, "backup": False},
                                blocking=False,
                            )
                        except Exception as err:
                            _LOGGER.error("Restart HA: Error on %s: %s", eid, err)
                            self.errors.append(f"{eid}: {err}")
                            self.current_index += 1
                            return

                        wait_seconds = 0
                        last_pct = -1
                        idle_time = 0
                        
                        while wait_seconds < 300:
                            await asyncio.sleep(1.5)
                            wait_seconds += 1.5
                            cur_st = self.hass.states.get(eid)
                            if not cur_st:
                                break
                                
                            pct = cur_st.attributes.get("update_percentage")
                            if pct is not None:
                                pct_val = int(pct)
                                if pct_val == last_pct:
                                    idle_time += 1.5
                                else:
                                    last_pct = pct_val
                                    idle_time = 0
                            else:
                                idle_time += 1.5
                                
                            # Strict Watchdog
                            if idle_time > 45:
                                _LOGGER.warning("Restart HA: Watchdog timeout (45s idle) on %s, skipping.", eid)
                                self.errors.append(f"{eid} bloqué (Watchdog)")
                                break

                            in_progress = cur_st.attributes.get("in_progress", False)
                            inst_v = cur_st.attributes.get("installed_version")
                            lat_v = cur_st.attributes.get("latest_version")
                            
                            if not in_progress and (cur_st.state == "off" or (inst_v and lat_v and inst_v == lat_v) or wait_seconds >= 8):
                                break
                                
                        self.current_index += 1
                        self.global_progress = int((self.current_index / self.total_updates) * 100)
                        self.broadcast_progress()
                
                # Execute all updates concurrently with a concurrency limit of 3
                await asyncio.gather(*( _update_single_entity(eid) for eid in targets ))

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
            elif action == ACTION_SAFE_BOOT:
                self.status_message = "Redémarrage en Mode Sans Échec en cours..."
                self.broadcast_progress()
                await asyncio.sleep(1)
                await self.execute_restart_action(ACTION_SAFE_BOOT)
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

    # Initialize schedule persistence on boot
    await orchestrator.async_init_storage()

    # Repair homeassistant.restart schema if corrupted
    _repair_restart_service_schema(hass)

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
                [ACTION_QUICK_RESTART, ACTION_SYSTEM_RESTART, ACTION_CANCEL, ACTION_SAFE_BOOT, ACTION_SCHEDULE_RESTART]
            ),
            vol.Optional("update_all", default=False): bool,
            vol.Optional("entity_ids"): [str],
            vol.Optional("schedule_time"): vol.Any(str, None),
            vol.Optional("schedule_day"): vol.Any(int, str, None),
            vol.Optional("recurring", default=False): bool,
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
                schedule_time=msg.get("schedule_time"),
                schedule_day=msg.get("schedule_day"),
                recurring=msg.get("recurring", False),
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

    @websocket_api.websocket_command({vol.Required("type"): WS_TYPE_CANCEL_SCHEDULE})
    @websocket_api.async_response
    async def ws_cancel_schedule(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        try:
            await orchestrator.cancel_schedule()
            connection.send_result(msg["id"], {"status": "cancelled"})
        except Exception as err:
            connection.send_error(msg["id"], "cancel_failed", str(err))

    websocket_api.async_register_command(hass, ws_get_status)
    websocket_api.async_register_command(hass, ws_start_process)
    websocket_api.async_register_command(hass, ws_abort_process)
    websocket_api.async_register_command(hass, ws_cancel_schedule)


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

    async def handle_cancel_schedule(call: ServiceCall) -> None:
        await orchestrator.cancel_schedule()

    hass.services.async_register(DOMAIN, "quick_restart", handle_quick_restart)
    hass.services.async_register(DOMAIN, "system_restart", handle_system_restart)
    hass.services.async_register(DOMAIN, "update_all", handle_update_all)
    hass.services.async_register(DOMAIN, "cancel_schedule", handle_cancel_schedule)
