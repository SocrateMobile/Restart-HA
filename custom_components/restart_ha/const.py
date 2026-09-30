"""Constants for the Restart HA integration."""
from __future__ import annotations

import json
import os

DOMAIN = "restart_ha"
NAME = "Restart HA"
_MANIFEST_PATH = os.path.join(os.path.dirname(__file__), "manifest.json")
try:
    with open(_MANIFEST_PATH, "r", encoding="utf-8") as _f:
        VERSION = json.load(_f).get("version", "unknown")
except Exception:
    VERSION = "unknown"

PANEL_URL_PATH = "restart_ha"
PANEL_TITLE = "Restart HA"
PANEL_ICON = "mdi:restart"

FRONTEND_URL_PATH = "/restart_ha_frontend"
FRONTEND_FILE_NAME = "restart-ha-panel.js"

# Action types
ACTION_QUICK_RESTART = "quick_restart"
ACTION_SYSTEM_RESTART = "system_restart"
ACTION_CANCEL = "cancel"
ACTION_SAFE_BOOT = "safe_boot"
ACTION_SCHEDULE_RESTART = "schedule_restart"

# WebSocket message types
WS_TYPE_START_PROCESS = "restart_ha/start_process"
WS_TYPE_GET_STATUS = "restart_ha/get_status"
WS_TYPE_ABORT_PROCESS = "restart_ha/abort_process"
WS_TYPE_CANCEL_SCHEDULE = "restart_ha/cancel_schedule"
WS_EVENT_PROGRESS = "restart_ha_progress"

# Storage
STORAGE_KEY = "restart_ha_schedule"
STORAGE_VERSION = 1
