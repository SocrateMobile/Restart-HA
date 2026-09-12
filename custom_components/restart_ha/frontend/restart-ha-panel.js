/**
 * Restart HA - Home Assistant Custom Panel & Modal Popin
 * Features:
 *  - Modal popin with Quick Restart, System Restart, Cancel
 *  - "Mettre tout à jour" option with auto-restart interception
 *  - Real-time continuous item progress bar and global progress bar
 *  - Zero-flicker architecture with stable DOM updates (no innerHTML re-renders)
 *  - Sidebar "MAJ" gradient badge with persistent MutationObserver
 */

class RestartHAPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._domCreated = false;
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

    // Fetch initial status and available updates from backend
    try {
      const res = await this._hass.callWS({ type: "restart_ha/get_status" });
      if (res) {
        this._status = { ...this._status, ...res };
      }
    } catch (e) {
      this._status.available_updates = this._scanAvailableUpdates();
    }

    // Subscribe to progress events
    try {
      if (this._hass.connection && this._hass.connection.subscribeEvents) {
        this._unsubProgress = await this._hass.connection.subscribeEvents(
          (event) => {
            if (event.data) {
              this._status = { ...this._status, ...event.data };
              this._updateUI();
              if (
                !this._status.is_running &&
                this._status.current_action === "cancel" &&
                this._status.global_progress === 100
              ) {
                setTimeout(() => this._navigateHome(), 2500);
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

  _navigateHome() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "/lovelace";
    }
  }

  async _handleAction(action) {
    if (!this._hass) return;

    const updates = this._status.available_updates || [];
    const shouldUpdateAll = this._updateAllChecked && updates.length > 0;

    if (!shouldUpdateAll) {
      if (action === "cancel") {
        this._navigateHome();
        return;
      }
      try {
        await this._hass.callWS({
          type: "restart_ha/start_process",
          action: action,
          update_all: false,
        });
        this._status.status_message =
          action === "quick_restart"
            ? "Redémarrage de Home Assistant en cours..."
            : "Redémarrage système en cours...";
        this._updateUI();
      } catch (e) {
        alert("Erreur lors du déclenchement du redémarrage : " + e.message);
      }
      return;
    }

    try {
      this._status.is_running = true;
      this._status.current_action = action;
      this._status.global_progress = 0;
      this._status.current_entity_progress = 0;
      this._status.status_message = "Initialisation de la file de mises à jour...";
      this._updateUI();

      await this._hass.callWS({
        type: "restart_ha/start_process",
        action: action,
        update_all: true,
        entity_ids: updates.map((u) => u.entity_id),
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
          background: rgba(10, 15, 29, 0.78);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          box-sizing: border-box;
        }

        .modal {
          background: var(--card-background-color, #1e293b);
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

        .updates-list {
          max-height: 170px;
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
        }

        .update-item:last-child {
          border-bottom: none;
        }

        .item-name {
          font-weight: 500;
          color: #f1f5f9;
        }

        .version-tag {
          font-size: 11px;
          font-family: monospace;
          background: rgba(255, 255, 255, 0.08);
          padding: 3px 8px;
          border-radius: 6px;
          color: #38bdf8;
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
                <h3 class="header-title">Restart Home Assistant</h3>
                <div class="header-subtitle">Options de redémarrage & gestion des mises à jour</div>
              </div>
            </div>
            <button class="close-btn" id="closeBtn" title="Fermer">
              <svg style="width: 18px; height: 18px; fill: currentColor;" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"/></svg>
            </button>
          </div>

          <!-- Body -->
          <div class="body">
            <!-- Option: Mettre tout à jour -->
            <label class="option-card" id="optionCard">
              <div class="option-info">
                <div class="checkbox-container">
                  <input type="checkbox" id="updateAllCb" checked>
                </div>
                <div class="option-text">
                  <h4>
                    Mettre tout à jour
                    <span class="badge-count" id="badgeCount" style="display: none;">0 disponibles</span>
                  </h4>
                  <p>Applique toutes les mises à jour avant d'exécuter l'action (bloque les redémarrages auto)</p>
                </div>
              </div>
            </label>

            <!-- Updates List -->
            <div class="updates-container" id="updatesContainer">
              <div class="updates-header">
                <span>Composants prêts à être mis à jour</span>
                <span id="updatesSummaryCount">0 éléments</span>
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

    // Cache elements for high performance zero-flicker updates
    const root = this.shadowRoot;
    this._el = {
      backdrop: root.getElementById("backdrop"),
      closeBtn: root.getElementById("closeBtn"),
      updateAllCb: root.getElementById("updateAllCb"),
      badgeCount: root.getElementById("badgeCount"),
      updatesContainer: root.getElementById("updatesContainer"),
      updatesSummaryCount: root.getElementById("updatesSummaryCount"),
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
      cancelBtn: root.getElementById("cancelBtn"),
      cancelBtnDesc: root.getElementById("cancelBtnDesc"),
    };

    // Attach stable event listeners
    this._el.closeBtn.onclick = () => this._navigateHome();
    this._el.backdrop.onclick = (e) => {
      if (e.target === this._el.backdrop && !this._status.is_running) {
        this._navigateHome();
      }
    };
    this._el.updateAllCb.onchange = (e) => this._toggleUpdateAll(e.target.checked);
    this._el.quickBtn.onclick = () => this._handleAction("quick_restart");
    this._el.systemBtn.onclick = () => this._handleAction("system_restart");
    this._el.cancelBtn.onclick = () => this._handleAction("cancel");
  }

  /**
   * Surgical zero-flicker UI updates (never wipes innerHTML)
   */
  _updateUI() {
    if (!this._el) return;

    const updates = this._status.available_updates || this._scanAvailableUpdates();
    const updateCount = updates.length;
    const isRunning = this._status.is_running;
    const globalProgress = Math.max(0, Math.min(100, Math.round(this._status.global_progress || 0)));
    const entityProgress = Math.max(0, Math.min(100, Math.round(this._status.current_entity_progress || 0)));
    const statusMsg = this._status.status_message || "";
    const isIntercepted = this._status.restart_intercepted;

    // 1. Update checkbox & count badge
    this._el.updateAllCb.disabled = isRunning;
    this._el.updateAllCb.checked = this._updateAllChecked;

    if (updateCount > 0) {
      this._el.badgeCount.textContent = `${updateCount} disponible${updateCount > 1 ? "s" : ""}`;
      this._el.badgeCount.style.display = "inline-block";
    } else {
      this._el.badgeCount.style.display = "none";
    }

    // 2. Updates list
    if (this._updateAllChecked && updateCount > 0) {
      this._el.updatesContainer.style.display = "block";
      this._el.updatesSummaryCount.textContent = `${updateCount} élément${updateCount > 1 ? "s" : ""}`;

      // Only rebuild items if count or targets changed
      const listHtml = updates
        .map(
          (u) => `
          <div class="update-item">
            <span class="item-name">${u.title || u.name}</span>
            <span class="version-tag">${u.installed_version} ➜ ${u.latest_version}</span>
          </div>
        `
        )
        .join("");
      if (this._lastListHtml !== listHtml) {
        this._lastListHtml = listHtml;
        this._el.updatesList.innerHTML = listHtml;
      }
    } else {
      this._el.updatesContainer.style.display = "none";
    }

    // 3. Progress Box
    if (isRunning || statusMsg) {
      this._el.progressBox.style.display = "flex";
      this._el.statusSpinner.style.display = isRunning ? "inline-block" : "none";
      this._el.statusMsgText.textContent = statusMsg || "Traitement en cours...";
      this._el.headerGlobalPct.textContent = `${globalProgress}%`;

      // Intercept alert
      this._el.interceptAlert.style.display = isIntercepted ? "flex" : "none";

      // Global progress
      const total = this._status.total_updates || updateCount || 0;
      const idx = this._status.current_index || 0;
      if (total > 0 && isRunning) {
        this._el.globalProgressLabel.textContent = `Progression globale (${Math.min(idx, total)}/${total})`;
      } else {
        this._el.globalProgressLabel.textContent = "Progression globale";
      }
      this._el.globalProgressPct.textContent = `${globalProgress}%`;
      this._el.globalProgressFill.style.width = `${globalProgress}%`;

      // Current Item progress
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

    if (this._updateAllChecked && updateCount > 0) {
      this._el.cancelBtnDesc.textContent = "Applique les mises à jour sans redémarrer";
    } else {
      this._el.cancelBtnDesc.textContent = "Ferme la fenêtre et retourne à l'accueil";
    }
  }
}

customElements.define("restart-ha-panel", RestartHAPanel);
