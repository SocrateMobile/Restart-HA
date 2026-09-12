"""Config flow for Restart HA integration."""
from __future__ import annotations

import logging
from typing import Any
import voluptuous as vol

from homeassistant import config_entries

try:
    from homeassistant.config_entries import ConfigFlowResult
except ImportError:
    ConfigFlowResult = Any  # type: ignore[misc,assignment]

from .const import DOMAIN, NAME

_LOGGER = logging.getLogger(__name__)


class RestartHAConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Restart HA."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the initial step."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(title=NAME, data=user_input)

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({}),
        )
