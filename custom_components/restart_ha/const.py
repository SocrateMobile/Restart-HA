"""Constants for the Restart HA integration."""
from __future__ import annotations

DOMAIN = "restart_ha"
NAME = "Restart HA"
VERSION = "1.0.6"

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
WS_EVENT_PROGRESS = "restart_ha_progress"
