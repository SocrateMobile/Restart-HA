/**
 * Restart HA - Home Assistant Custom Panel & Modal Popin
 * Features:
 *  - Modal popin with Quick Restart, System Restart, Cancel
 *  - "Mettre tout à jour" option with auto-restart interception
 *  - Live item progress bar and global progress bar
 *  - Sidebar "MAJ" gradient badge with persistent MutationObserver
 */

class RestartHAPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
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
    this._render();
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
      // Fallback: extract available updates directly from hass states
      this._status.available_updates = this._scanAvailableUpdates();
    }

    // Subscribe to progress events
    try {
      if (this._hass.connection && this._hass.connection.subscribeEvents) {
        this._unsubProgress = await this._hass.connection.subscribeEvents(
          (event) => {
            if (event.data) {
              this._status = { ...this._status, ...event.data };
              this._render();
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

    this._render();
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

    // Check if updates are requested
    const updates = this._status.available_updates || [];
    const shouldUpdateAll = this._updateAllChecked && updates.length > 0;

    if (!shouldUpdateAll) {
      // Direct action without waiting for updates
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
        this._render();
      } catch (e) {
        alert("Erreur lors du déclenchement du redémarrage : " + e.message);
      }
      return;
    }

    // Action with "Mettre tout à jour"
    try {
      this._status.is_running = true;
      this._status.current_action = action;
      this._status.global_progress = 0;
      this._status.current_entity_progress = 0;
      this._status.status_message = "Initialisation de la file de mises à jour...";
      this._render();

      await this._hass.callWS({
        type: "restart_ha/start_process",
        action: action,
        update_all: true,
        entity_ids: updates.map((u) => u.entity_id),
      });
    } catch (e) {
      this._status.is_running = false;
      this._status.status_message = "Erreur : " + e.message;
      this._render();
      alert("Impossible de lancer les mises à jour : " + e.message);
    }
  }

  _toggleUpdateAll(e) {
    this._updateAllChecked = e.target.checked;
    this._render();
  }

  /**
   * Universal persistent update badge with MutationObserver
   * Matches the exact gradient badge mechanism developed for DomoLink integrations
   */
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

      // Check if any update entity is available
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
    } catch (e) {
      // Ignore cross-boundary shadow issues
    }
  }

  _render() {
    const updates = this._status.available_updates || this._scanAvailableUpdates();
    const updateCount = updates.length;
    const isRunning = this._status.is_running;
    const globalProgress = this._status.global_progress || 0;
    const entityProgress = this._status.current_entity_progress || 0;
    const statusMsg = this._status.status_message || "";
    const isIntercepted = this._status.restart_intercepted;

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
          max-width: 600px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(59, 130, 246, 0.15);
          overflow: hidden;
          animation: popin 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes popin {
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
          transition: all 0.2s;
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
          gap: 20px;
        }

        /* Checkbox Box */
        .option-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
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

        .checkbox-container {
          position: relative;
          width: 22px;
          height: 22px;
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

        /* Updates list */
        .updates-container {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.2);
          overflow: hidden;
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
          max-height: 180px;
          overflow-y: auto;
          padding: 6px 0;
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

        /* Progress Bars */
        .progress-box {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: 14px;
          padding: 16px;
          display: flex;
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
          transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* Action Buttons */
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
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          text-align: left;
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
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

        /* Quick Restart Button */
        .btn-quick {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: #ffffff;
        }
        .btn-quick:hover:not(:disabled) {
          background: linear-gradient(135deg, #1d4ed8, #1e40af);
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
        }

        /* System Reboot Button */
        .btn-system {
          background: linear-gradient(135deg, #d97706, #b45309);
          color: #ffffff;
        }
        .btn-system:hover:not(:disabled) {
          background: linear-gradient(135deg, #b45309, #92400e);
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(217, 119, 6, 0.4);
        }

        /* Cancel Button */
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
        <div class="modal">
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
            <button class="close-btn" id="closeBtn" title="Fermer" ${isRunning ? "disabled" : ""}>
              <svg style="width: 18px; height: 18px; fill: currentColor;" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"/></svg>
            </button>
          </div>

          <!-- Body -->
          <div class="body">
            <!-- Option: Mettre tout à jour -->
            <label class="option-card">
              <div class="option-info">
                <div class="checkbox-container">
                  <input type="checkbox" id="updateAllCb" ${this._updateAllChecked ? "checked" : ""} ${isRunning ? "disabled" : ""}>
                </div>
                <div class="option-text">
                  <h4>
                    Mettre tout à jour
                    ${updateCount > 0 ? `<span class="badge-count">${updateCount} disponible${updateCount > 1 ? "s" : ""}</span>` : ""}
                  </h4>
                  <p>Applique toutes les mises à jour avant d'exécuter l'action (bloque les redémarrages auto)</p>
                </div>
              </div>
            </label>

            <!-- Updates List (if available and checked) -->
            ${
              this._updateAllChecked && updateCount > 0
                ? `
              <div class="updates-container">
                <div class="updates-header">
                  <span>Composants prêts à être mis à jour</span>
                  <span>${updateCount} élément${updateCount > 1 ? "s" : ""}</span>
                </div>
                <div class="updates-list">
                  ${updates
                    .map(
                      (u) => `
                    <div class="update-item">
                      <span class="item-name">${u.title || u.name}</span>
                      <span class="version-tag">${u.installed_version} ➜ ${u.latest_version}</span>
                    </div>
                  `
                    )
                    .join("")}
                </div>
              </div>
            `
                : ""
            }

            <!-- Active Progress View -->
            ${
              isRunning || statusMsg
                ? `
              <div class="progress-box">
                ${
                  isIntercepted
                    ? `
                  <div class="intercept-alert">
                    <span>⚠️ Redémarrage automatique intercepté avec succès : en attente de la fin des autres MAJ.</span>
                  </div>
                `
                    : ""
                }
                
                <div class="progress-title-row">
                  <span class="status-badge">
                    ${isRunning ? `<div class="spinner"></div>` : ""}
                    ${statusMsg || "Traitement en cours..."}
                  </span>
                  <span>${globalProgress}%</span>
                </div>

                <!-- Global Progress Bar -->
                <div>
                  <div style="font-size: 11px; color: #94a3b8; margin-bottom: 5px;">Progression globale</div>
                  <div class="progress-bar-wrap">
                    <div class="progress-bar-fill fill-global" style="width: ${globalProgress}%"></div>
                  </div>
                </div>

                <!-- Item Progress Bar (if running and an item is being processed) -->
                ${
                  isRunning && this._status.current_entity_name
                    ? `
                  <div>
                    <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-bottom: 5px;">
                      <span>Élément en cours : ${this._status.current_entity_name}</span>
                      <span>${entityProgress}%</span>
                    </div>
                    <div class="progress-bar-wrap">
                      <div class="progress-bar-fill fill-item" style="width: ${entityProgress}%"></div>
                    </div>
                  </div>
                `
                    : ""
                }
              </div>
            `
                : ""
            }

            <!-- Action Buttons Grid -->
            <div class="actions-grid">
              <!-- Quick Restart -->
              <button class="btn btn-quick" id="quickRestartBtn" ${isRunning ? "disabled" : ""}>
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

              <!-- System Reboot -->
              <button class="btn btn-system" id="systemRestartBtn" ${isRunning ? "disabled" : ""}>
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

              <!-- Cancel -->
              <button class="btn btn-cancel" id="cancelBtn" ${isRunning ? "disabled" : ""}>
                <div class="btn-content">
                  <div class="btn-icon">
                    <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"/></svg>
                  </div>
                  <div class="btn-titles">
                    <span class="btn-title">Annuler</span>
                    <span class="btn-desc">${this._updateAllChecked && updateCount > 0 ? "Applique les mises à jour sans redémarrer" : "Ferme la fenêtre et retourne à l'accueil"}</span>
                  </div>
                </div>
                <svg style="width: 20px; height: 20px; fill: currentColor;" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12L8.59 7.41L10 6L16 12L10 18L8.59 16.59Z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this._attachEventListeners();
  }

  _attachEventListeners() {
    const shadow = this.shadowRoot;
    if (!shadow) return;

    const closeBtn = shadow.getElementById("closeBtn");
    if (closeBtn) {
      closeBtn.onclick = () => this._navigateHome();
    }

    const backdrop = shadow.getElementById("backdrop");
    if (backdrop) {
      backdrop.onclick = (e) => {
        if (e.target === backdrop && !this._status.is_running) {
          this._navigateHome();
        }
      };
    }

    const updateAllCb = shadow.getElementById("updateAllCb");
    if (updateAllCb) {
      updateAllCb.onchange = (e) => this._toggleUpdateAll(e);
    }

    const quickBtn = shadow.getElementById("quickRestartBtn");
    if (quickBtn) {
      quickBtn.onclick = () => this._handleAction("quick_restart");
    }

    const systemBtn = shadow.getElementById("systemRestartBtn");
    if (systemBtn) {
      systemBtn.onclick = () => this._handleAction("system_restart");
    }

    const cancelBtn = shadow.getElementById("cancelBtn");
    if (cancelBtn) {
      cancelBtn.onclick = () => this._handleAction("cancel");
    }
  }
}

customElements.define("restart-ha-panel", RestartHAPanel);
