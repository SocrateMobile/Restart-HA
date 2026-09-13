/**
 * Restart HA - Home Assistant Custom Panel & Modal Popin
 * Features:
 *  - Modal popin with Quick Restart, System Restart, Cancel
 *  - "Mettre tout à jour" option with auto-restart interception
 *  - Selective item updates with individual checkboxes (all checked by default)
 *  - Real-time continuous item progress bar and global progress bar
 *  - Instant reliable restart execution (direct callService + WebSocket fallback)
 *  - Zero-flicker architecture with stable DOM updates (no innerHTML re-renders)
 *  - Sidebar "MAJ" gradient badge with persistent MutationObserver
 */

class RestartHAPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._domCreated = false;
    this._restartTriggered = false;
    this._selectedEntityIds = new Set();
    this._selectionInitialized = false;
    this._status = {
      is_running: false,
      current_action: null,
      total_updates: 0,
      current_index: 0,
      current_entity_id: null,
      current_entity_name: null,
      current_entity_progress: 0,
      global_progress: 0,
      status_message: "",
      restart_intercepted: false,
      available_updates: [],
    };
    this._updateAllChecked = true;
    this._unsubProgress = null;
    this._sidebarObserverAttached = false;
  }

  set hass(hass) {
    this._hass = hass;
    this._syncSidebarBadge();
    if (!this._initialized) {
      this._initialized = true;
      this._init();
    }
  }

  connectedCallback() {
    if (!this._domCreated) {
      this._buildDOM();
      this._domCreated = true;
    }
    this._syncSidebarBadge();
  }

  disconnectedCallback() {
    if (this._unsubProgress) {
      try {
        this._unsubProgress();
      } catch (e) {}
      this._unsubProgress = null;
    }
  }

  async _init() {
    if (!this._hass) return;

    try {
      const res = await this._hass.callWS({ type: "restart_ha/get_status" });
      if (res) {
        this._status = { ...this._status, ...res };
      }
    } catch (e) {
      this._status.available_updates = this._scanAvailableUpdates();
    }

    // Initialize all updates as selected by default
    this._initSelection();

    try {
      if (this._hass.connection && this._hass.connection.subscribeEvents) {
        this._unsubProgress = await this._hass.connection.subscribeEvents(
          (event) => {
            if (event.data) {
              this._status = { ...this._status, ...event.data };
              this._updateUI();

              if (!this._status.is_running && this._status.global_progress === 100) {
                const act = this._status.current_action;
                if (act === "cancel") {
                  setTimeout(() => this._navigateHome(), 2500);
                } else if (act === "quick_restart") {
                  this._triggerFinalRestart("quick_restart");
                } else if (act === "system_restart") {
                  this._triggerFinalRestart("system_restart");
                }
              }
            }
          },
          "restart_ha_progress"
        );
      }
    } catch (e) {
      console.warn("[Restart HA] Could not subscribe to progress events:", e);
    }

    this._updateUI();
    this._syncSidebarBadge();
  }

  _scanAvailableUpdates() {
    if (!this._hass || !this._hass.states) return [];
    const updates = [];
    for (const [entityId, stateObj] of Object.entries(this._hass.states)) {
      if (!entityId.startsWith("update.")) continue;
      const attrs = stateObj.attributes || {};
      const isAvail =
        stateObj.state === "on" ||
        attrs.update_available === true ||
        (attrs.latest_version &&
          attrs.installed_version &&
          attrs.latest_version !== attrs.installed_version);

      if (isAvail) {
        updates.push({
          entity_id: entityId,
          name: attrs.friendly_name || entityId,
          title: attrs.title || attrs.friendly_name || entityId,
          installed_version: attrs.installed_version || "Inconnue",
          latest_version: attrs.latest_version || "Nouvelle version",
          entity_picture: attrs.entity_picture,
          update_percentage: attrs.update_percentage,
          in_progress: attrs.in_progress || false,
        });
      }
    }
    return updates;
  }

  _initSelection() {
    if (this._selectionInitialized) return;
    const updates = this._status.available_updates || this._scanAvailableUpdates();
    if (updates.length > 0) {
      this._selectedEntityIds = new Set(updates.map((u) => u.entity_id));
      this._selectionInitialized = true;
    }
  }

  _navigateHome() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "/lovelace";
    }
  }

  async _rebootHost() {
    this._status.is_running = true;
    this._status.status_message = "Redémarrage du système en cours...";
    this._updateUI();

    // 1. Official method from Home Assistant dialog-restart: direct Supervisor API with timeout: null
    try {
      await this._hass.callWS({
        type: "supervisor/api",
        endpoint: "/host/reboot",
        method: "post",
        timeout: null,
      });
      return;
    } catch (wsErr) {
      // If socket disconnected or closed, host is already rebooting
      if (!this._hass.connected || !this._hass.connection?.connected) {
        return;
      }
      console.warn("Supervisor API /host/reboot warning, trying service fallback:", wsErr);
    }

    // 2. Service fallback: hassio.host_reboot
    try {
      if (
        this._hass.services &&
        this._hass.services.hassio &&
        this._hass.services.hassio.host_reboot
      ) {
        await this._hass.callService("hassio", "host_reboot");
        return;
      }
    } catch (svcErr) {
      if (!this._hass.connected || !this._hass.connection?.connected) {
        return;
      }
      console.warn("hassio.host_reboot warning, trying backend orchestrator:", svcErr);
    }

    // 3. Backend orchestrator fallback
    try {
      await this._hass.callWS({
        type: "restart_ha/start_process",
        action: "system_restart",
        update_all: false,
      });
    } catch (backendErr) {
      if (!this._hass.connected || !this._hass.connection?.connected) {
        return;
      }
      console.error("System restart failed:", backendErr);
      const msg =
        backendErr?.message ||
        backendErr?.error ||
        (typeof backendErr === "string" ? backendErr : "Erreur de communication");
      alert("Erreur lors du redémarrage du système : " + msg);
      this._status.is_running = false;
      this._updateUI();
    }
  }

  async _quickRestart() {
    this._status.is_running = true;
    this._status.status_message = "Redémarrage de Home Assistant en cours...";
    this._updateUI();

    // 1. Try Supervisor homeassistant_restart if available
    if (
      this._hass.services &&
      this._hass.services.hassio &&
      this._hass.services.hassio.homeassistant_restart
    ) {
      try {
        await this._hass.callService("hassio", "homeassistant_restart");
        return;
      } catch (hassioErr) {
        if (!this._hass.connected || !this._hass.connection?.connected) {
          return;
        }
        console.warn("hassio.homeassistant_restart warning:", hassioErr);
      }
    }

    // 2. Core restart with safe_mode: false
    try {
      await this._hass.callService("homeassistant", "restart", { safe_mode: false });
    } catch (coreErr) {
      if (!this._hass.connected || !this._hass.connection?.connected) {
        return;
      }
      // 3. Backend orchestrator fallback
      try {
        await this._hass.callWS({
          type: "restart_ha/start_process",
          action: "quick_restart",
          update_all: false,
        });
      } catch (backendErr) {
        if (!this._hass.connected || !this._hass.connection?.connected) {
          return;
        }
        const msg =
          backendErr?.message ||
          backendErr?.error ||
          (typeof backendErr === "string" ? backendErr : "Erreur inconnue");
        alert("Erreur lors du redémarrage : " + msg);
        this._status.is_running = false;
        this._updateUI();
      }
    }
  }

  async _triggerFinalRestart(action) {
    if (this._restartTriggered) return;
    this._restartTriggered = true;

    try {
      if (action === "system_restart") {
        await this._rebootHost();
      } else {
        await this._quickRestart();
      }
    } catch (e) {
      console.debug("Final restart trigger:", e);
    }
  }

  async _handleAction(action, extraPayload = null) {
    if (!this._hass) return;

    const updates = this._status.available_updates || this._scanAvailableUpdates();
    const selectedList = updates
      .filter((u) => this._selectedEntityIds.has(u.entity_id))
      .map((u) => u.entity_id);

    const shouldUpdate = this._updateAllChecked && selectedList.length > 0;

    // Direct mode: No updates requested or none selected
    if (!shouldUpdate) {
      if (action === "cancel") {
        this._navigateHome();
        return;
      }

      if (action === "system_restart") {
        await this._rebootHost();
        return;
      } else if (action === "quick_restart") {
        await this._quickRestart();
        return;
      }
    }

    // Pipeline mode (or Scheduled/Safe Boot via backend)
    try {
      this._restartTriggered = false;
      this._status.is_running = true;
      this._status.current_action = action;
      this._status.global_progress = 0;
      this._status.current_entity_progress = 0;
      
      if (action === "schedule_restart") {
        this._status.status_message = "Redémarrage planifié à " + extraPayload + "...";
      } else if (action === "safe_boot") {
        this._status.status_message = "Initialisation du Mode Sans Échec...";
      } else {
        this._status.status_message = "Initialisation des mises à jour sélectionnées...";
      }
      this._updateUI();

      await this._hass.callWS({
        type: "restart_ha/start_process",
        action: action,
        update_all: shouldUpdate,
        entity_ids: selectedList,
        schedule_time: action === "schedule_restart" ? extraPayload : null,
      });
    } catch (e) {
      this._status.is_running = false;
      this._status.status_message = "Erreur : " + e.message;
      this._updateUI();
      alert("Impossible de lancer les mises à jour : " + e.message);
    }
  }

  _toggleUpdateAll(checked) {
    this._updateAllChecked = checked;
    if (checked) {
      const updates = this._status.available_updates || this._scanAvailableUpdates();
      this._selectedEntityIds = new Set(updates.map((u) => u.entity_id));
    }
    this._updateUI();
  }

  _toggleItemSelection(entityId, isChecked) {
    if (isChecked) {
      this._selectedEntityIds.add(entityId);
    } else {
      this._selectedEntityIds.delete(entityId);
    }
    this._updateUI();
  }

  _toggleSelectAllItems() {
    const updates = this._status.available_updates || this._scanAvailableUpdates();
    if (this._selectedEntityIds.size === updates.length) {
      this._selectedEntityIds.clear();
    } else {
      this._selectedEntityIds = new Set(updates.map((u) => u.entity_id));
    }
    this._updateUI();
  }

  _syncSidebarBadge() {
    try {
      const ha = document.querySelector("home-assistant");
      const main = ha && ha.shadowRoot && ha.shadowRoot.querySelector("home-assistant-main");
      const sidebar = main && main.shadowRoot && main.shadowRoot.querySelector("ha-sidebar");
      if (!sidebar || !sidebar.shadowRoot) return;

      if (!this._sidebarObserverAttached) {
        this._sidebarObserverAttached = true;
        try {
          const obs = new MutationObserver(() => this._syncSidebarBadge());
          obs.observe(sidebar.shadowRoot, { childList: true, subtree: true });
        } catch (e) {}
      }

      let hasAnyUpdate = false;
      if (this._hass && this._hass.states) {
        for (const [id, st] of Object.entries(this._hass.states)) {
          if (id.startsWith("update.")) {
            if (
              st.state === "on" ||
              (st.attributes && st.attributes.update_available === true)
            ) {
              hasAnyUpdate = true;
              break;
            }
          }
        }
      }

      const container = sidebar.shadowRoot.querySelector(
        "paper-listbox, ha-md-list, nav, div.menu, div.items"
      );
      const items = (container || sidebar.shadowRoot).querySelectorAll(
        "paper-icon-item, ha-md-list-item, ha-sidebar-item, a"
      );

      const targetPatterns = ["restart_ha", "restart-ha", "restart ha"];

      for (const item of items) {
        const href =
          item.getAttribute("href") ||
          (item.dataset && (item.dataset.panel || item.dataset.href)) ||
          "";
        const id = item.id || "";
        const ariaLabel = item.getAttribute("aria-label") || "";
        const text = (item.textContent || "").toLowerCase();

        const isMatch = targetPatterns.some((pat) => {
          const p = pat.toLowerCase();
          return (
            href.toLowerCase().includes(p) ||
            id.toLowerCase().includes(p) ||
            ariaLabel.toLowerCase().includes(p.replace(/_/g, " ")) ||
            text.includes("restart")
          );
        });

        if (isMatch) {
          let badge = item.querySelector(".domolink-sidebar-badge");
          if (hasAnyUpdate) {
            if (!badge) {
              badge = document.createElement("span");
              badge.className = "badge domolink-sidebar-badge";
              badge.setAttribute("slot", "end");
              badge.style.cssText =
                "background: linear-gradient(135deg, #ef4444, #f59e0b); color: white; border-radius: 9999px; padding: 2px 7px; font-size: 10px; font-weight: 800; box-shadow: 0 2px 6px rgba(239,68,68,0.4); margin-left: auto; letter-spacing: 0.5px; z-index: 10; display: inline-block;";
              badge.textContent = "MAJ";
              badge.title = "Mises à jour disponibles !";
              item.appendChild(badge);
            }
          } else if (badge) {
            badge.remove();
          }
        }
      }
    } catch (e) {}
  }

  _buildDOM() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: 9999;
          font-family: var(--ha-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
          color: var(--primary-text-color, #ffffff);
          box-sizing: border-box;
        }

        .backdrop {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: color-mix(in srgb, var(--primary-background-color, #0a0f1d) 78%, transparent);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          box-sizing: border-box;
        }

        .modal {
          background: color-mix(in srgb, var(--card-background-color, #1e293b) 85%, transparent);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 20px;
          width: 100%;
          max-width: 620px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(59, 130, 246, 0.15);
          overflow: hidden;
          animation: popin-once 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes popin-once {
          0% { opacity: 0; transform: scale(0.92) translateY(16px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }

        .header {
          padding: 24px 28px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255, 255, 255, 0.02);
        }

        .header-title-group {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .header-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);
          color: white;
          flex-shrink: 0;
        }

        .header-icon svg {
          width: 26px;
          height: 26px;
          fill: currentColor;
        }

        .header-title {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.3px;
          margin: 0;
          color: var(--primary-text-color, #f8fafc);
        }

        .header-subtitle {
          font-size: 13px;
          color: var(--secondary-text-color, #94a3b8);
          margin-top: 2px;
        }

        .close-btn {
          background: rgba(255, 255, 255, 0.07);
          border: none;
          color: #94a3b8;
          width: 34px;
          height: 34px;
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .close-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #ffffff;
        }

        .body {
          padding: 24px 28px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .option-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
        }

        .option-card:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(59, 130, 246, 0.4);
        }

        .option-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .checkbox-container input {
          width: 22px;
          height: 22px;
          margin: 0;
          cursor: pointer;
          accent-color: #3b82f6;
        }

        .option-text h4 {
          margin: 0;
          font-size: 15px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .option-text p {
          margin: 3px 0 0;
          font-size: 12px;
          color: #94a3b8;
        }

        .badge-count {
          background: linear-gradient(135deg, #ef4444, #f59e0b);
          color: white;
          border-radius: 9999px;
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 700;
          box-shadow: 0 2px 6px rgba(239, 68, 68, 0.4);
        }

        /* Updates List Container */
        .updates-container {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.2);
          overflow: hidden;
          display: none;
        }

        .updates-header {
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.04);
          font-size: 13px;
          font-weight: 600;
          color: #94a3b8;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .select-toggle-btn {
          background: none;
          border: none;
          color: #38bdf8;
          font-size: 12px;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 4px;
          transition: background 0.15s;
        }

        .select-toggle-btn:hover {
          background: rgba(56, 189, 248, 0.12);
        }

        .updates-list {
          max-height: 190px;
          overflow-y: auto;
          padding: 4px 0;
        }

        .update-item {
          padding: 10px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          font-size: 13px;
          cursor: pointer;
          user-select: none;
          transition: background 0.15s ease;
        }

        .update-item:hover {
          background: rgba(255, 255, 255, 0.04);
        }

        .update-item:last-child {
          border-bottom: none;
        }

        .item-left {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .item-checkbox {
          width: 17px;
          height: 17px;
          margin: 0;
          cursor: pointer;
          accent-color: #3b82f6;
          flex-shrink: 0;
        }

        .item-name {
          font-weight: 500;
          color: #f1f5f9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .version-tag {
          font-size: 11px;
          font-family: monospace;
          background: rgba(255, 255, 255, 0.08);
          padding: 3px 8px;
          border-radius: 6px;
          color: #38bdf8;
          flex-shrink: 0;
          margin-left: 8px;
        }

        /* Progress Box */
        .progress-box {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(59, 130, 246, 0.35);
          border-radius: 14px;
          padding: 16px;
          display: none;
          flex-direction: column;
          gap: 14px;
        }

        .progress-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
          font-weight: 600;
        }

        .progress-bar-wrap {
          height: 9px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 9999px;
          overflow: hidden;
          position: relative;
        }

        .progress-bar-fill {
          height: 100%;
          border-radius: 9999px;
          transition: width 0.35s ease-out;
          width: 0%;
        }

        .fill-item {
          background: linear-gradient(90deg, #38bdf8, #3b82f6);
        }

        .fill-global {
          background: linear-gradient(90deg, #10b981, #06b6d4, #3b82f6);
        }

        .status-badge {
          font-size: 12px;
          color: #e2e8f0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-top-color: #38bdf8;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .intercept-alert {
          background: rgba(245, 158, 11, 0.15);
          border: 1px solid rgba(245, 158, 11, 0.4);
          color: #fbbf24;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
          display: none;
          align-items: center;
          gap: 8px;
        }

        .actions-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .btn {
          border: none;
          border-radius: 14px;
          padding: 14px 20px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: transform 0.15s ease, background 0.2s ease, box-shadow 0.2s ease;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          text-align: left;
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none !important;
        }

        .btn-content {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .btn-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.2);
          flex-shrink: 0;
        }

        .btn-icon svg {
          width: 20px;
          height: 20px;
          fill: currentColor;
        }

        .btn-titles {
          display: flex;
          flex-direction: column;
        }

        .btn-title {
          font-size: 15px;
          font-weight: 600;
        }

        .btn-desc {
          font-size: 12px;
          opacity: 0.85;
          font-weight: 400;
          margin-top: 2px;
        }

        .btn-quick {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: #ffffff;
        }
        .btn-quick:hover:not(:disabled) {
          background: linear-gradient(135deg, #1d4ed8, #1e40af);
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
        }

        .btn-system {
          background: linear-gradient(135deg, #d97706, #b45309);
          color: #ffffff;
        }
        .btn-system:hover:not(:disabled) {
          background: linear-gradient(135deg, #b45309, #92400e);
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(217, 119, 6, 0.4);
        }

        .btn-cancel {
          background: rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .btn-cancel:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
        }
      </style>

      <div class="backdrop" id="backdrop">
        <div class="modal" id="modal">
          <!-- Header -->
          <div class="header">
            <div class="header-title-group">
              <div class="header-icon">
                <svg viewBox="0 0 24 24"><path d="M12 4V1L8 5L12 9V6C15.31 6 18 8.69 18 12C18 13.04 17.73 14.03 17.25 14.89L18.71 16.35C19.52 15.08 20 13.6 20 12C20 7.58 16.42 4 12 4M12 18C8.69 18 6 15.31 6 12C6 10.96 6.27 9.97 6.75 9.11L5.29 7.65C4.48 8.92 4 10.4 4 12C4 16.42 7.58 20 12 20V23L16 19L12 15V18Z"/></svg>
              </div>
              <div>
                <h3 class="header-title" id="headerTitle" style="cursor: pointer; user-select: none;">Restart Home Assistant</h3>
                <div class="header-subtitle">Options de redémarrage & gestion des mises à jour</div>
              </div>
            </div>
            <button class="close-btn" id="closeBtn" title="Fermer">
              <svg style="width: 18px; height: 18px; fill: currentColor;" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"/></svg>
            </button>
          </div>

          <!-- Body -->
          <div class="body">
            <!-- Master Checkbox: Mettre tout à jour -->
            <label class="option-card" id="optionCard">
              <div class="option-info">
                <div class="checkbox-container">
                  <input type="checkbox" id="updateAllCb" checked>
                </div>
                <div class="option-text">
                  <h4>
                    Mettre tout à jour
                    <span class="badge-count" id="badgeCount" style="display: none;">0 sélectionnés</span>
                  </h4>
                  <p>Applique les mises à jour sélectionnées avant l'action (bloque les redémarrages auto)</p>
                </div>
              </div>
            </label>

            <!-- Updates Selective List -->
            <div class="updates-container" id="updatesContainer">
              <div class="updates-header">
                <span id="updatesSummaryTitle">Mises à jour disponibles</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span id="updatesSummaryCount" style="font-size: 11px;">0/0 sélectionnés</span>
                  <button class="select-toggle-btn" id="selectToggleBtn">Tout basculer</button>
                </div>
              </div>
              <div class="updates-list" id="updatesList"></div>
            </div>

            <!-- Progress Box -->
            <div class="progress-box" id="progressBox">
              <div class="intercept-alert" id="interceptAlert">
                <span>⚠️ Redémarrage automatique intercepté avec succès : en attente de la fin des autres MAJ.</span>
              </div>

              <!-- Status line -->
              <div class="progress-title-row">
                <span class="status-badge">
                  <div class="spinner" id="statusSpinner"></div>
                  <span id="statusMsgText">Traitement en cours...</span>
                </span>
                <span id="headerGlobalPct" style="font-size: 14px; font-weight: 700; color: #38bdf8;">0%</span>
              </div>

              <!-- Global Progress -->
              <div>
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-bottom: 5px;">
                  <span id="globalProgressLabel">Progression globale</span>
                  <span id="globalProgressPct">0%</span>
                </div>
                <div class="progress-bar-wrap">
                  <div class="progress-bar-fill fill-global" id="globalProgressFill"></div>
                </div>
              </div>

              <!-- Item Progress -->
              <div id="itemProgressSection" style="display: none;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-bottom: 5px;">
                  <span id="itemProgressLabel">Élément en cours</span>
                  <span id="itemProgressPct">0%</span>
                </div>
                <div class="progress-bar-wrap">
                  <div class="progress-bar-fill fill-item" id="itemProgressFill"></div>
                </div>
              </div>
            </div>

            <!-- Schedule UI -->
            <div class="schedule-box" style="margin-bottom: 16px; padding: 12px; background: rgba(0,0,0,0.1); border-radius: 12px; display: flex; align-items: center; justify-content: space-between;">
              <div>
                <strong style="display: block; font-size: 14px;">Redémarrage Planifié</strong>
                <span style="font-size: 12px; color: rgba(255,255,255,0.6);">Choisissez l'heure d'exécution</span>
              </div>
              <div style="display: flex; gap: 8px;">
                <input type="time" id="scheduleTime" style="padding: 6px; border-radius: 6px; border: none; background: rgba(255,255,255,0.1); color: white;">
                <button id="scheduleBtn" style="padding: 6px 12px; border-radius: 6px; border: none; background: var(--primary-color, #03a9f4); color: white; cursor: pointer;">Planifier</button>
              </div>
            </div>

            <!-- Action Buttons Grid -->
            <div class="actions-grid">
              <button class="btn btn-quick" id="quickRestartBtn">
                <div class="btn-content">
                  <div class="btn-icon">
                    <svg viewBox="0 0 24 24"><path d="M7 2V13H10V22L17 10H13L17 2H7Z"/></svg>
                  </div>
                  <div class="btn-titles">
                    <span class="btn-title">Redémarrage Rapide</span>
                    <span class="btn-desc">Redémarre Home Assistant immédiatement (sans validation)</span>
                  </div>
                </div>
                <svg style="width: 20px; height: 20px; fill: currentColor;" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12L8.59 7.41L10 6L16 12L10 18L8.59 16.59Z"/></svg>
              </button>

              <button class="btn btn-system" id="systemRestartBtn">
                <div class="btn-content">
                  <div class="btn-icon">
                    <svg viewBox="0 0 24 24"><path d="M4 1H20C21.1 1 22 1.9 22 3V7C22 8.1 21.1 9 20 9H4C2.9 9 2 8.1 2 7V3C2 1.9 2.9 1 4 1M4 11H20C21.1 11 22 11.9 22 13V17C22 18.1 21.1 19 20 19H4C2.9 19 2 18.1 2 17V13C2 11.9 2.9 11 4 11M6 5C6 5.55 6.45 6 7 6C7.55 6 8 5.55 8 5C8 4.45 7.55 4 7 4C6.45 4 6 4.45 6 5M6 15C6 15.55 6.45 16 7 16C7.55 16 8 15.55 8 15C8 14.45 7.55 14 7 14C6.45 14 6 14.45 6 15Z"/></svg>
                  </div>
                  <div class="btn-titles">
                    <span class="btn-title">Redémarrage Système</span>
                    <span class="btn-desc">Redémarre l'hôte complet (Home Assistant + OS)</span>
                  </div>
                </div>
                <svg style="width: 20px; height: 20px; fill: currentColor;" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12L8.59 7.41L10 6L16 12L10 18L8.59 16.59Z"/></svg>
              </button>

              <button class="btn btn-system" id="safeBootBtn" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3);">
                <div class="btn-content">
                  <div class="btn-icon" style="color: #ef4444;">
                    <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
                  </div>
                  <div class="btn-titles">
                    <span class="btn-title">Mode Sans Échec</span>
                    <span class="btn-desc">Redémarre sans les composants personnalisés</span>
                  </div>
                </div>
                <svg style="width: 20px; height: 20px; fill: currentColor;" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12L8.59 7.41L10 6L16 12L10 18L8.59 16.59Z"/></svg>
              </button>

              <button class="btn btn-cancel" id="cancelBtn">
                <div class="btn-content">
                  <div class="btn-icon">
                    <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"/></svg>
                  </div>
                  <div class="btn-titles">
                    <span class="btn-title">Annuler</span>
                    <span class="btn-desc" id="cancelBtnDesc">Ferme la fenêtre et retourne à l'accueil</span>
                  </div>
                </div>
                <svg style="width: 20px; height: 20px; fill: currentColor;" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12L8.59 7.41L10 6L16 12L10 18L8.59 16.59Z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const root = this.shadowRoot;
    this._el = {
      backdrop: root.getElementById("backdrop"),
      closeBtn: root.getElementById("closeBtn"),
      updateAllCb: root.getElementById("updateAllCb"),
      badgeCount: root.getElementById("badgeCount"),
      updatesContainer: root.getElementById("updatesContainer"),
      updatesSummaryTitle: root.getElementById("updatesSummaryTitle"),
      updatesSummaryCount: root.getElementById("updatesSummaryCount"),
      selectToggleBtn: root.getElementById("selectToggleBtn"),
      updatesList: root.getElementById("updatesList"),
      progressBox: root.getElementById("progressBox"),
      interceptAlert: root.getElementById("interceptAlert"),
      statusSpinner: root.getElementById("statusSpinner"),
      statusMsgText: root.getElementById("statusMsgText"),
      headerGlobalPct: root.getElementById("headerGlobalPct"),
      globalProgressLabel: root.getElementById("globalProgressLabel"),
      globalProgressPct: root.getElementById("globalProgressPct"),
      globalProgressFill: root.getElementById("globalProgressFill"),
      itemProgressSection: root.getElementById("itemProgressSection"),
      itemProgressLabel: root.getElementById("itemProgressLabel"),
      itemProgressPct: root.getElementById("itemProgressPct"),
      itemProgressFill: root.getElementById("itemProgressFill"),
      quickBtn: root.getElementById("quickRestartBtn"),
      systemBtn: root.getElementById("systemRestartBtn"),
      safeBtn: root.getElementById("safeBootBtn"),
      scheduleBtn: root.getElementById("scheduleBtn"),
      scheduleTime: root.getElementById("scheduleTime"),
      cancelBtn: root.getElementById("cancelBtn"),
      cancelBtnDesc: root.getElementById("cancelBtnDesc"),
      headerTitle: root.getElementById("headerTitle"),
    };

    let titleClicks = [];
    if (this._el.headerTitle) {
      this._el.headerTitle.onclick = () => {
        const now = Date.now();
        titleClicks = titleClicks.filter((t) => now - t < 2000);
        titleClicks.push(now);
        if (titleClicks.length >= 3) {
          titleClicks = [];
          launchSocrateRulesEasterEgg(this.shadowRoot);
        }
      };
    }

    this._el.closeBtn.onclick = () => this._navigateHome();
    this._el.backdrop.onclick = (e) => {
      if (e.target === this._el.backdrop && !this._status.is_running) {
        this._navigateHome();
      }
    };
    this._el.updateAllCb.onchange = (e) => this._toggleUpdateAll(e.target.checked);
    this._el.selectToggleBtn.onclick = () => this._toggleSelectAllItems();
    this._el.quickBtn.onclick = () => this._handleAction("quick_restart");
    this._el.systemBtn.onclick = () => this._handleAction("system_restart");
    this._el.safeBtn.onclick = () => this._handleAction("safe_boot");
    this._el.scheduleBtn.onclick = () => {
      if (!this._el.scheduleTime.value) {
        alert("Veuillez choisir une heure pour planifier.");
        return;
      }
      this._handleAction("schedule_restart", this._el.scheduleTime.value);
    };
    this._el.cancelBtn.onclick = () => this._handleAction("cancel");
  }

  _updateUI() {
    if (!this._el) return;

    const updates = this._status.available_updates || this._scanAvailableUpdates();
    const totalCount = updates.length;
    this._initSelection();

    const selectedCount = updates.filter((u) => this._selectedEntityIds.has(u.entity_id)).length;
    const isRunning = this._status.is_running;
    const globalProgress = Math.max(0, Math.min(100, Math.round(this._status.global_progress || 0)));
    const entityProgress = Math.max(0, Math.min(100, Math.round(this._status.current_entity_progress || 0)));
    const statusMsg = this._status.status_message || "";
    const isIntercepted = this._status.restart_intercepted;

    // 1. Update master checkbox & count badge
    this._el.updateAllCb.disabled = isRunning;
    this._el.updateAllCb.checked = this._updateAllChecked;

    if (totalCount > 0 && this._updateAllChecked) {
      this._el.badgeCount.textContent = `${selectedCount} sélectionné${selectedCount > 1 ? "s" : ""}`;
      this._el.badgeCount.style.display = "inline-block";
    } else {
      this._el.badgeCount.style.display = "none";
    }

    // 2. Selective Updates List
    if (this._updateAllChecked && totalCount > 0) {
      this._el.updatesContainer.style.display = "block";
      this._el.updatesSummaryCount.textContent = `${selectedCount}/${totalCount} sélectionné${selectedCount > 1 ? "s" : ""}`;

      // Build or update individual item checkboxes
      this._renderUpdatesList(updates, isRunning);
    } else {
      this._el.updatesContainer.style.display = "none";
    }

    // 3. Progress Box
    if (isRunning || statusMsg) {
      this._el.progressBox.style.display = "flex";
      this._el.statusSpinner.style.display = isRunning ? "inline-block" : "none";
      this._el.statusMsgText.textContent = statusMsg || "Traitement en cours...";
      this._el.headerGlobalPct.textContent = `${globalProgress}%`;

      this._el.interceptAlert.style.display = isIntercepted ? "flex" : "none";

      const total = this._status.total_updates || selectedCount || totalCount || 0;
      const idx = this._status.current_index || 0;
      if (total > 0 && isRunning) {
        this._el.globalProgressLabel.textContent = `Progression globale (${Math.min(idx, total)}/${total})`;
      } else {
        this._el.globalProgressLabel.textContent = "Progression globale";
      }
      this._el.globalProgressPct.textContent = `${globalProgress}%`;
      this._el.globalProgressFill.style.width = `${globalProgress}%`;

      if (isRunning && this._status.current_entity_name) {
        this._el.itemProgressSection.style.display = "block";
        this._el.itemProgressLabel.textContent = `Élément en cours : ${this._status.current_entity_name}`;
        this._el.itemProgressPct.textContent = `${entityProgress}%`;
        this._el.itemProgressFill.style.width = `${entityProgress}%`;
      } else {
        this._el.itemProgressSection.style.display = "none";
      }
    } else {
      this._el.progressBox.style.display = "none";
    }

    // 4. Buttons state & descriptions
    this._el.quickBtn.disabled = isRunning;
    this._el.systemBtn.disabled = isRunning;
    this._el.cancelBtn.disabled = isRunning;
    this._el.closeBtn.disabled = isRunning;

    if (this._updateAllChecked && selectedCount > 0) {
      this._el.cancelBtnDesc.textContent = "Applique les mises à jour sans redémarrer";
    } else {
      this._el.cancelBtnDesc.textContent = "Ferme la fenêtre et retourne à l'accueil";
    }
  }

  _renderUpdatesList(updates, isRunning) {
    const listEl = this._el.updatesList;
    if (!listEl) return;

    // Check if items structure changed
    const currentKeys = updates.map((u) => u.entity_id).join("|");
    if (this._lastRenderedKeys !== currentKeys) {
      this._lastRenderedKeys = currentKeys;
      listEl.innerHTML = "";

      updates.forEach((u) => {
        const itemRow = document.createElement("label");
        itemRow.className = "update-item";
        itemRow.dataset.entityId = u.entity_id;

        const isChecked = this._selectedEntityIds.has(u.entity_id);

        itemRow.innerHTML = `
          <div class="item-left">
            <input type="checkbox" class="item-checkbox" data-entity-id="${u.entity_id}" ${isChecked ? "checked" : ""} ${isRunning ? "disabled" : ""}>
            <span class="item-name">${u.title || u.name}</span>
          </div>
          <span class="version-tag">${u.installed_version} ➜ ${u.latest_version}</span>
        `;

        const cb = itemRow.querySelector(".item-checkbox");
        cb.addEventListener("change", (e) => {
          e.stopPropagation();
          this._toggleItemSelection(u.entity_id, cb.checked);
        });

        itemRow.addEventListener("click", (e) => {
          if (e.target !== cb && !isRunning) {
            cb.checked = !cb.checked;
            this._toggleItemSelection(u.entity_id, cb.checked);
          }
        });

        listEl.appendChild(itemRow);
      });
    } else {
      // Sync checkbox states without re-creating DOM
      const checkboxes = listEl.querySelectorAll(".item-checkbox");
      checkboxes.forEach((cb) => {
        const eid = cb.dataset.entityId;
        cb.checked = this._selectedEntityIds.has(eid);
        cb.disabled = isRunning;
      });
    }
  }
}

/* =========================================================================
 * 🎆 SOCRATE RULES - EASTER EGG MODULE
 * ========================================================================= */
function launchSocrateRulesEasterEgg(targetRoot) {
  if (targetRoot.getElementById("socrate-rules-overlay")) return;

  // 1. Inject fonts in document head if not present
  if (!document.getElementById("socrate-rules-fonts")) {
    const fontLink = document.createElement("link");
    fontLink.id = "socrate-rules-fonts";
    fontLink.rel = "stylesheet";
    fontLink.href = "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;900&family=Poppins:wght@300;600&display=swap";
    document.head.appendChild(fontLink);
  }

  // 2. Create fullscreen overlay
  const overlay = document.createElement("div");
  overlay.id = "socrate-rules-overlay";
  overlay.innerHTML = `
    <style>
      #socrate-rules-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 999999;
        background-color: #030008;
        font-family: 'Poppins', sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
        user-select: none;
        -webkit-user-select: none;
        opacity: 0;
        transition: opacity 0.35s ease, transform 0.35s ease;
      }
      #socrate-rules-overlay * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        user-select: none;
        -webkit-user-select: none;
      }
      #socrate-rules-overlay canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1;
        pointer-events: none;
      }
      #socrate-rules-overlay .socrate-container {
        position: relative;
        z-index: 10;
        text-align: center;
        pointer-events: auto;
      }
      #socrate-rules-overlay h1.socrate-title {
        font-family: 'Orbitron', sans-serif;
        font-size: 6.5rem;
        font-weight: 900;
        letter-spacing: 12px;
        text-transform: uppercase;
        display: inline-block;
        line-height: 1.1;
        filter: 
          drop-shadow(0px 1px 0px #990066)
          drop-shadow(0px 2px 0px #660066)
          drop-shadow(0px 3px 0px #330066)
          drop-shadow(0px 4px 0px #1a0033)
          drop-shadow(0px 12px 15px rgba(0,0,0,0.9))
          drop-shadow(0 0 25px rgba(127, 0, 255, 0.6));
        transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), filter 0.5s;
        cursor: pointer;
      }
      #socrate-rules-overlay h1.socrate-title:hover {
        transform: scale(1.05);
        filter: 
          drop-shadow(0px 1px 0px #ff007f)
          drop-shadow(0px 2px 0px #990066)
          drop-shadow(0px 3px 0px #660066)
          drop-shadow(0px 4px 0px #330066)
          drop-shadow(0px 5px 0px #1a0033)
          drop-shadow(0px 15px 20px rgba(0,0,0,0.9))
          drop-shadow(0 0 40px rgba(0, 240, 255, 0.9));
      }
      #socrate-rules-overlay .socrate-letter {
        display: inline-block;
        background: linear-gradient(
          to bottom,
          #ff66b3 0%,
          #ff007f 35%,
          #7f00ff 65%,
          #00f0ff 100%
        );
        background-size: 100% 100%;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: socrate-wave 1.6s ease-in-out infinite;
      }
      #socrate-rules-overlay p.socrate-sub {
        font-size: 1.1rem;
        color: rgba(255, 255, 255, 0.6);
        margin-top: 30px;
        letter-spacing: 4px;
        text-transform: uppercase;
        font-weight: 300;
        opacity: 0;
        animation: socrate-fadeIn 2s ease forwards 0.8s;
      }
      #socrate-rules-overlay p.socrate-sub strong {
        color: #00f0ff;
        font-weight: 600;
        text-shadow: 0 0 10px rgba(0, 240, 255, 0.5);
      }
      #socrate-rules-overlay .socrate-instructions {
        position: absolute;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10;
        color: rgba(255, 255, 255, 0.4);
        font-size: 0.8rem;
        letter-spacing: 2px;
        text-transform: uppercase;
        pointer-events: none;
        animation: socrate-pulse 2s infinite;
        text-align: center;
        white-space: nowrap;
      }
      @keyframes socrate-wave {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-25px); }
      }
      @keyframes socrate-fadeIn {
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes socrate-pulse {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.8; }
      }
      @media (max-width: 768px) {
        #socrate-rules-overlay h1.socrate-title {
          font-size: 3rem;
          letter-spacing: 6px;
        }
        #socrate-rules-overlay p.socrate-sub {
          font-size: 0.85rem;
          letter-spacing: 2px;
        }
      }
    </style>
    <canvas id="socrateParticleCanvas"></canvas>
    <div class="socrate-container">
      <h1 class="socrate-title" id="socrateTitle">Socrate Rules</h1>
      <p class="socrate-sub">Une expérience visuelle <strong>hautement philosophique</strong>.</p>
    </div>
    <div class="socrate-instructions">Cliquez 3 fois sur "SOCRATE RULES" pour quitter</div>
  `;

  targetRoot.appendChild(overlay);

  // Fade in animation
  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
  });

  const canvas = overlay.querySelector("#socrateParticleCanvas");
  const ctx = canvas.getContext("2d");
  const title = overlay.querySelector("#socrateTitle");
  const TWO_PI = Math.PI * 2;

  // Wave letter splitting
  const lines = ["Socrate", "Rules"];
  title.innerHTML = "";
  let globalCharIndex = 0;
  lines.forEach((lineText) => {
    const lineDiv = document.createElement("div");
    lineDiv.style.display = "block";
    [...lineText].forEach((char) => {
      const span = document.createElement("span");
      if (char === " ") {
        span.innerHTML = "&nbsp;";
      } else {
        span.textContent = char;
      }
      span.classList.add("socrate-letter");
      span.style.animationDelay = `${globalCharIndex * 0.07}s`;
      lineDiv.appendChild(span);
      globalCharIndex++;
    });
    title.appendChild(lineDiv);
  });

  // Particles system
  let particlesArray = [];
  let sparksArray = [];
  let animId = null;
  let isClosing = false;

  let mouse = {
    x: null,
    y: null,
    radius: 150,
    radiusSq: 22500,
  };

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();

  class Particle {
    constructor(x, y, directionX, directionY, size, color) {
      this.x = x;
      this.y = y;
      this.directionX = directionX;
      this.directionY = directionY;
      this.size = size;
      this.color = color;
      this.originalSize = size;
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, TWO_PI, false);
      ctx.fillStyle = this.color;
      ctx.fill();
    }

    update() {
      if (this.x > canvas.width || this.x < 0) this.directionX = -this.directionX;
      if (this.y > canvas.height || this.y < 0) this.directionY = -this.directionY;
      this.x += this.directionX;
      this.y += this.directionY;

      if (mouse.x != null && mouse.y != null) {
        let dx = mouse.x - this.x;
        let dy = mouse.y - this.y;
        let distanceSq = dx * dx + dy * dy;
        if (distanceSq < mouse.radiusSq) {
          let distance = Math.sqrt(distanceSq);
          let forceDirectionX = dx / distance;
          let forceDirectionY = dy / distance;
          let force = (mouse.radius - distance) / mouse.radius;
          this.x -= forceDirectionX * force * 3;
          this.y -= forceDirectionY * force * 3;
          if (this.size < this.originalSize * 3.5) this.size += 0.2;
        } else if (this.size > this.originalSize) {
          this.size -= 0.1;
        }
      } else if (this.size > this.originalSize) {
        this.size -= 0.1;
      }
      this.draw();
    }
  }

  class Spark {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.size = Math.random() * 6 + 2;
      this.speedX = (Math.random() - 0.5) * 12;
      this.speedY = (Math.random() - 0.5) * 12;
      const colors = ["#ff007f", "#7f00ff", "#00f0ff", "#ffffff"];
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.alpha = 1;
      this.decay = Math.random() * 0.015 + 0.01;
    }

    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      this.speedX *= 0.98;
      this.speedY *= 0.98;
      this.alpha -= this.decay;
      if (this.alpha > 0) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, TWO_PI);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function initParticles() {
    particlesArray = [];
    let baseParticles = (canvas.width * canvas.height) / 9000;
    let numberOfParticles = Math.min(baseParticles, 250);
    for (let i = 0; i < numberOfParticles; i++) {
      let size = Math.random() * 2 + 0.5;
      let x = Math.random() * (canvas.width - size * 4) + size * 2;
      let y = Math.random() * (canvas.height - size * 4) + size * 2;
      let directionX = Math.random() * 0.4 - 0.2;
      let directionY = Math.random() * 0.4 - 0.2;
      let colorPalette = ["rgba(127, 0, 255, 0.4)", "rgba(0, 240, 255, 0.3)", "rgba(255, 0, 127, 0.3)"];
      let color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      particlesArray.push(new Particle(x, y, directionX, directionY, size, color));
    }
  }

  function connectParticles() {
    let maxDistance = 120;
    let maxDistanceSq = maxDistance * maxDistance;
    for (let a = 0; a < particlesArray.length; a++) {
      for (let b = a + 1; b < particlesArray.length; b++) {
        let dx = particlesArray[a].x - particlesArray[b].x;
        let dy = particlesArray[a].y - particlesArray[b].y;
        let distanceSq = dx * dx + dy * dy;
        if (distanceSq < maxDistanceSq) {
          let distance = Math.sqrt(distanceSq);
          let opacity = (1 - distance / maxDistance) * 0.15;
          ctx.strokeStyle = `rgba(127, 0, 255, ${opacity})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
          ctx.lineTo(particlesArray[b].x, particlesArray[b].y);
          ctx.stroke();
        }
      }
    }
  }

  function animate() {
    ctx.fillStyle = "rgba(3, 0, 8, 0.15)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < particlesArray.length; i++) {
      particlesArray[i].update();
    }

    for (let i = sparksArray.length - 1; i >= 0; i--) {
      sparksArray[i].update();
      if (sparksArray[i].alpha <= 0) {
        sparksArray.splice(i, 1);
      }
    }

    connectParticles();
    animId = requestAnimationFrame(animate);
  }

  // Mouse & Touch events
  function onMouseMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }
  function onMouseOut() {
    mouse.x = null;
    mouse.y = null;
  }
  function onTouchMove(e) {
    if (e.touches && e.touches.length > 0) {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
    }
  }
  function onTouchEnd() {
    mouse.x = null;
    mouse.y = null;
  }
  function onOverlayClick(e) {
    const x = e.clientX || window.innerWidth / 2;
    const y = e.clientY || window.innerHeight / 2;
    for (let i = 0; i < 30; i++) {
      sparksArray.push(new Spark(x, y));
    }
  }
  function onKeyDown(e) {
    if (e.key === "Escape") {
      cleanup();
    }
  }

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseout", onMouseOut);
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("keydown", onKeyDown);
  overlay.addEventListener("click", onOverlayClick);

  // Exit trigger: 3 clicks in < 2s on "SOCRATE RULES"
  let exitClicks = [];
  function handleExitClick(clientX, clientY) {
    if (isClosing) return;
    const now = Date.now();
    exitClicks = exitClicks.filter((t) => now - t < 2000);
    exitClicks.push(now);

    const x = clientX || window.innerWidth / 2;
    const y = clientY || window.innerHeight / 2;
    for (let i = 0; i < 70; i++) {
      sparksArray.push(new Spark(x, y));
    }

    if (exitClicks.length >= 3) {
      isClosing = true;
      exitClicks = [];
      for (let i = 0; i < 150; i++) {
        sparksArray.push(new Spark(window.innerWidth / 2, window.innerHeight / 2));
      }
      overlay.style.transition = "opacity 0.38s ease, transform 0.38s ease";
      overlay.style.opacity = "0";
      overlay.style.transform = "scale(1.05)";
      setTimeout(() => {
        cleanup();
      }, 360);
    }
  }

  title.addEventListener("click", (e) => {
    e.stopPropagation();
    handleExitClick(e.clientX, e.clientY);
  });
  title.addEventListener(
    "touchstart",
    (e) => {
      e.stopPropagation();
      const touch = e.touches && e.touches[0];
      handleExitClick(touch ? touch.clientX : null, touch ? touch.clientY : null);
    },
    { passive: true }
  );

  function cleanup() {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    window.removeEventListener("resize", resizeCanvas);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseout", onMouseOut);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("keydown", onKeyDown);
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  initParticles();
  animate();
}

customElements.define("restart-ha-panel", RestartHAPanel);
