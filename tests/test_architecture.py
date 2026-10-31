"""Non-regression tests for Restart-HA integration."""
import os
import sys
import unittest
from unittest.mock import MagicMock

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from tests.ha_mock import setup_ha_mock

setup_ha_mock()

import voluptuous as vol
from custom_components.restart_ha.const import DOMAIN, VERSION


class TestRestartHAArchitecture(unittest.TestCase):
    """Test architecture and service schemas for Restart-HA."""

    def test_schema_service_allows_extra(self):
        """Ensure admin service schema permits extra keys for HA 2024.10+ compatibility."""
        schema_service = vol.Schema({}, extra=vol.ALLOW_EXTRA)

        # Calling with update_all or action parameter
        res_quick = schema_service({"update_all": True, "custom_key": 123})
        self.assertTrue(res_quick["update_all"])
        self.assertEqual(res_quick["custom_key"], 123)

        res_update = schema_service({"action": "quick_restart", "extra_param": "abc"})
        self.assertEqual(res_update["action"], "quick_restart")

    def test_manifest_requirements_and_version(self):
        """Ensure manifest.json is well-formed with domain and version."""
        import json
        manifest_path = os.path.join(ROOT_DIR, "custom_components", "restart_ha", "manifest.json")
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        self.assertEqual(manifest.get("domain"), "restart_ha")
        self.assertTrue(manifest.get("version"))
        self.assertIn("codeowners", manifest)


if __name__ == "__main__":
    unittest.main()
