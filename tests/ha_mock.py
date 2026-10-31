"""Lightweight mock for Home Assistant core modules to allow fast unit testing."""
import sys
import types
from unittest.mock import MagicMock, AsyncMock
from datetime import datetime, timezone
import voluptuous as vol

def setup_ha_mock():
    """Inject mock homeassistant packages into sys.modules if not present."""
    if "homeassistant" in sys.modules and hasattr(sys.modules["homeassistant"], "_is_mock"):
        return

    # homeassistant
    ha = types.ModuleType("homeassistant")
    ha._is_mock = True
    ha.__path__ = []
    sys.modules["homeassistant"] = ha

    # homeassistant.core
    ha_core = types.ModuleType("homeassistant.core")
    class StatesMock:
        def __init__(self):
            self._states = {}
        def get(self, entity_id):
            return self._states.get(entity_id)
        def set(self, entity_id, state):
            self._states[entity_id] = state

    class ServicesMock:
        def __init__(self):
            self.async_call = AsyncMock()
            self.async_register = MagicMock()
            self.has_service = MagicMock(return_value=True)

    class HomeAssistant:
        def __init__(self):
            self.loop = MagicMock()
            self.loop.time = lambda: 1000.0
            self.services = ServicesMock()
            self.states = StatesMock()
            self.config = MagicMock()
            self.config.path = lambda *parts: "/".join(str(p) for p in parts)
            self.config_entries = MagicMock()
            self.auth = MagicMock()
            self.data = {}
            
            def _mock_create_task(coro):
                import asyncio
                try:
                    loop = asyncio.get_running_loop()
                    return loop.create_task(coro)
                except RuntimeError:
                    if hasattr(coro, "close"):
                        coro.close()
                    return MagicMock()

            self.async_create_task = _mock_create_task
            
            async def _mock_async_add_executor_job(f, *args):
                return f(*args)

            self.async_add_executor_job = _mock_async_add_executor_job

    def callback(func):
        return func

    class State:
        def __init__(self, entity_id, state, attributes=None):
            self.entity_id = entity_id
            self.state = state
            self.attributes = attributes or {}
            self.name = self.attributes.get("friendly_name") or entity_id.split(".")[-1].replace("_", " ").title()

    class SupportsResponse:
        NONE = "none"
        ONLY = "only"
        OPTIONAL = "optional"

    class ServiceCall:
        def __init__(self, domain="", service="", data=None, context=None):
            self.domain = domain
            self.service = service
            self.data = data or {}
            self.context = context

    ha_core.HomeAssistant = HomeAssistant
    ha_core.ServiceCall = ServiceCall
    ha_core.callback = callback
    ha_core.State = State
    ha_core.SupportsResponse = SupportsResponse
    sys.modules["homeassistant.core"] = ha_core

    # homeassistant.const
    ha_const = types.ModuleType("homeassistant.const")
    ha_const.STATE_ALARM_DISARMED = "disarmed"
    ha_const.STATE_ALARM_ARMED_HOME = "armed_home"
    ha_const.STATE_ALARM_ARMED_AWAY = "armed_away"
    ha_const.STATE_ALARM_ARMED_NIGHT = "armed_night"
    ha_const.STATE_ALARM_ARMED_VACATION = "armed_vacation"
    ha_const.STATE_ALARM_ARMING = "arming"
    ha_const.STATE_ALARM_PENDING = "pending"
    ha_const.STATE_ALARM_TRIGGERED = "triggered"
    ha_const.CONF_NAME = "name"
    ha_const.CONF_CODE = "code"
    ha_const.ATTR_ENTITY_ID = "entity_id"
    sys.modules["homeassistant.const"] = ha_const

    # homeassistant.exceptions
    ha_exc = types.ModuleType("homeassistant.exceptions")
    class HomeAssistantError(Exception):
        pass
    ha_exc.HomeAssistantError = HomeAssistantError
    sys.modules["homeassistant.exceptions"] = ha_exc

    # homeassistant.util
    ha_util = types.ModuleType("homeassistant.util")
    ha_util.__path__ = []
    sys.modules["homeassistant.util"] = ha_util

    # homeassistant.util.dt
    ha_dt = types.ModuleType("homeassistant.util.dt")
    ha_dt.now = lambda: datetime.now(timezone.utc)
    ha_dt.utcnow = lambda: datetime.now(timezone.utc)
    ha_dt.as_local = lambda dt: dt
    ha_dt.parse_datetime = lambda dt_str: datetime.fromisoformat(dt_str) if dt_str else None
    sys.modules["homeassistant.util.dt"] = ha_dt

    # homeassistant.util.location
    ha_loc = types.ModuleType("homeassistant.util.location")
    ha_loc.distance = lambda lat1, lon1, lat2, lon2: 100.0
    sys.modules["homeassistant.util.location"] = ha_loc

    # homeassistant.components
    ha_comp = types.ModuleType("homeassistant.components")
    ha_comp.__path__ = []
    sys.modules["homeassistant.components"] = ha_comp

    # homeassistant.components
    ha_comp = types.ModuleType("homeassistant.components")
    ha_comp.persistent_notification = MagicMock()
    sys.modules["homeassistant.components"] = ha_comp

    # homeassistant.components.alarm_control_panel
    ha_acp = types.ModuleType("homeassistant.components.alarm_control_panel")
    class CodeFormat:
        NUMBER = "number"
        TEXT = "text"

    class AlarmControlPanelEntityFeature:
        ARM_HOME = 1
        ARM_AWAY = 2
        ARM_NIGHT = 4
        ARM_VACATION = 8
        TRIGGER = 16

    class AlarmControlPanelState:
        DISARMED = "disarmed"
        ARMED_HOME = "armed_home"
        ARMED_AWAY = "armed_away"
        ARMED_NIGHT = "armed_night"
        ARMED_VACATION = "armed_vacation"
        ARMING = "arming"
        PENDING = "pending"
        TRIGGERED = "triggered"

    class AlarmControlPanelEntity:
        def __init__(self):
            self.hass = None
            self._state = "disarmed"
            self._attr_state = "disarmed"
            self._attr_name = "Domolink Alarm"
            self._attr_extra_state_attributes = {}

        @property
        def name(self):
            return getattr(self, "_attr_name", "Domolink Alarm")

        @property
        def state(self):
            return getattr(self, "_state", getattr(self, "_attr_state", "disarmed"))

        @property
        def alarm_state(self):
            return getattr(self, "_state", getattr(self, "_attr_state", "disarmed"))

        @property
        def extra_state_attributes(self):
            return getattr(self, "_attr_extra_state_attributes", {})

        def async_write_ha_state(self):
            pass

    ha_acp.CodeFormat = CodeFormat
    ha_acp.AlarmControlPanelEntityFeature = AlarmControlPanelEntityFeature
    ha_acp.AlarmControlPanelState = AlarmControlPanelState
    ha_acp.AlarmControlPanelEntity = AlarmControlPanelEntity
    sys.modules["homeassistant.components.alarm_control_panel"] = ha_acp

    # homeassistant.helpers
    ha_helpers = types.ModuleType("homeassistant.helpers")
    ha_helpers.__path__ = []
    sys.modules["homeassistant.helpers"] = ha_helpers

    # homeassistant.helpers.config_validation
    ha_cv = types.ModuleType("homeassistant.helpers.config_validation")
    ha_cv.string = str
    ha_cv.boolean = bool
    ha_cv.ensure_list = lambda x: [x] if not isinstance(x, list) else x
    ha_cv.entity_id = str
    ha_cv.time_period = lambda x: x
    ha_cv.positive_int = int
    ha_cv.port = int
    ha_cv.config_entry_only_config_schema = lambda domain: vol.Schema({}, extra=vol.ALLOW_EXTRA)
    sys.modules["homeassistant.helpers.config_validation"] = ha_cv

    # homeassistant.helpers.typing
    ha_typing = types.ModuleType("homeassistant.helpers.typing")
    ha_typing.ConfigType = dict
    sys.modules["homeassistant.helpers.typing"] = ha_typing

    # homeassistant.helpers.start
    ha_start = types.ModuleType("homeassistant.helpers.start")
    ha_start.async_at_started = MagicMock()
    sys.modules["homeassistant.helpers.start"] = ha_start

    # homeassistant.helpers.restore_state
    ha_restore = types.ModuleType("homeassistant.helpers.restore_state")
    class RestoreEntity:
        async def async_get_last_state(self):
            return None
    ha_restore.RestoreEntity = RestoreEntity
    sys.modules["homeassistant.helpers.restore_state"] = ha_restore

    # homeassistant.helpers.device_registry
    ha_dr = types.ModuleType("homeassistant.helpers.device_registry")
    class DeviceInfo(dict):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
    ha_dr.DeviceInfo = DeviceInfo
    ha_dr.async_get = MagicMock()
    sys.modules["homeassistant.helpers.device_registry"] = ha_dr

    # homeassistant.helpers.entity_registry
    ha_er = types.ModuleType("homeassistant.helpers.entity_registry")
    ha_er.async_get = MagicMock()
    sys.modules["homeassistant.helpers.entity_registry"] = ha_er

    # homeassistant.helpers.event
    ha_event = types.ModuleType("homeassistant.helpers.event")
    ha_event.async_track_time_interval = MagicMock(return_value=lambda: None)
    ha_event.async_track_state_change_event = MagicMock(return_value=lambda: None)
    ha_event.async_call_later = MagicMock(return_value=lambda: None)
    ha_event.async_track_time_change = MagicMock(return_value=lambda: None)
    sys.modules["homeassistant.helpers.event"] = ha_event

    # homeassistant.helpers.aiohttp_client
    ha_aiohttp = types.ModuleType("homeassistant.helpers.aiohttp_client")
    ha_aiohttp.async_get_clientsession = MagicMock()
    sys.modules["homeassistant.helpers.aiohttp_client"] = ha_aiohttp

    # homeassistant.helpers.storage
    ha_storage = types.ModuleType("homeassistant.helpers.storage")
    class Store:
        def __init__(self, *args, **kwargs):
            self._data = None
        async def async_load(self):
            return self._data
        async def async_save(self, data):
            self._data = data
    ha_storage.Store = Store
    sys.modules["homeassistant.helpers.storage"] = ha_storage

    # homeassistant.helpers.entity_platform
    ha_platform = types.ModuleType("homeassistant.helpers.entity_platform")
    ha_platform.AddEntitiesCallback = MagicMock()
    sys.modules["homeassistant.helpers.entity_platform"] = ha_platform

    # homeassistant.helpers.selector
    ha_selector = types.ModuleType("homeassistant.helpers.selector")
    ha_selector.SelectSelector = MagicMock()
    ha_selector.TextSelector = MagicMock()
    sys.modules["homeassistant.helpers.selector"] = ha_selector

    # homeassistant.components.websocket_api
    ha_ws = types.ModuleType("homeassistant.components.websocket_api")
    ha_ws.ActiveConnection = MagicMock
    ha_ws.async_register_command = MagicMock()
    ha_ws.async_response = lambda f: f
    ha_ws.require_admin = lambda f: f
    ha_ws.websocket_command = lambda schema: lambda f: f
    sys.modules["homeassistant.components.websocket_api"] = ha_ws

    # homeassistant.helpers.storage
    ha_storage = types.ModuleType("homeassistant.helpers.storage")
    class StoreMock:
        def __init__(self, hass, version, key):
            self._data = {}
        async def async_load(self):
            return self._data
        async def async_save(self, data):
            self._data = data
    ha_storage.Store = StoreMock
    sys.modules["homeassistant.helpers.storage"] = ha_storage

    # homeassistant.helpers.update_coordinator
    ha_coord = types.ModuleType("homeassistant.helpers.update_coordinator")
    class DataUpdateCoordinatorMock:
        def __class_getitem__(cls, item):
            return cls
        def __init__(self, hass, logger=None, name="", update_interval=None, **kwargs):
            self.hass = hass
            self.data = {}
            self.name = name
    ha_coord.DataUpdateCoordinator = DataUpdateCoordinatorMock
    sys.modules["homeassistant.helpers.update_coordinator"] = ha_coord

    # homeassistant.helpers.service
    ha_service = types.ModuleType("homeassistant.helpers.service")
    ha_service.async_register_admin_service = MagicMock()
    sys.modules["homeassistant.helpers.service"] = ha_service

    # homeassistant.config_entries
    ha_config_entries = types.ModuleType("homeassistant.config_entries")
    class ConfigEntry:
        def __init__(self, entry_id="test_entry", data=None, options=None):
            self.entry_id = entry_id
            self.data = data or {}
            self.options = options or {}
    ha_config_entries.ConfigEntry = ConfigEntry
    sys.modules["homeassistant.config_entries"] = ha_config_entries

    # homeassistant.components.recorder
    ha_rec = types.ModuleType("homeassistant.components.recorder")
    ha_rec_hist = types.ModuleType("homeassistant.components.recorder.history")
    ha_rec_hist.state_changes_during_period = MagicMock(return_value={})
    ha_rec.get_instance = MagicMock()
    ha_rec.history = ha_rec_hist
    sys.modules["homeassistant.components.recorder"] = ha_rec
    sys.modules["homeassistant.components.recorder.history"] = ha_rec_hist

    # homeassistant.components.camera
    ha_cam = types.ModuleType("homeassistant.components.camera")
    ha_cam.async_get_image = MagicMock()
    sys.modules["homeassistant.components.camera"] = ha_cam

    # homeassistant.components.frontend
    ha_frontend = types.ModuleType("homeassistant.components.frontend")
    ha_frontend.async_register_built_in_panel = MagicMock()
    sys.modules["homeassistant.components.frontend"] = ha_frontend

    # homeassistant.components.http
    ha_http = types.ModuleType("homeassistant.components.http")
    ha_http.__path__ = []
    class StaticPathConfig:
        def __init__(self, url_path, path, cache_headers):
            self.url_path = url_path
            self.path = path
            self.cache_headers = cache_headers
    class HomeAssistantView:
        url = ""
        name = ""
        requires_auth = True
    ha_http.StaticPathConfig = StaticPathConfig
    ha_http.HomeAssistantView = HomeAssistantView
    sys.modules["homeassistant.components.http"] = ha_http

    # homeassistant.components.http.auth
    ha_http_auth = types.ModuleType("homeassistant.components.http.auth")
    ha_http_auth.async_sign_path = lambda hass, path, td=None: path
    sys.modules["homeassistant.components.http.auth"] = ha_http_auth

    # homeassistant.components.mqtt
    ha_mqtt = types.ModuleType("homeassistant.components.mqtt")
    ha_mqtt.async_publish = MagicMock()
    ha_mqtt.async_subscribe = MagicMock()
    sys.modules["homeassistant.components.mqtt"] = ha_mqtt
