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


/* =========================================================================
 * 🌐 INTERNATIONALIZATION (FR, EN, DE, IT, ES, UK)
 * ========================================================================= */
const TRANSLATIONS = {
  fr: {
    panel_title: "Restart HA",
    panel_subtitle: "Options de redémarrage & gestion des mises à jour",
    update_all_title: "Mettre tout à jour",
    update_all_desc: "Applique les mises à jour sélectionnées avant l'action (bloque les redémarrages auto)",
    selected_count: "{count} sélectionné{s}",
    available_updates: "Mises à jour disponibles",
    toggle_all: "Tout basculer",
    quick_restart: "Redémarrage Rapide",
    quick_restart_desc: "Redémarre Home Assistant immédiatement (sans validation)",
    system_restart: "Redémarrage Système",
    system_restart_desc: "Redémarre l'hôte complet (Home Assistant + OS)",
    safe_boot: "Mode Sans Échec",
    safe_boot_desc: "Redémarre sans les composants personnalisés",
    cancel: "Annuler",
    cancel_desc: "Ferme la fenêtre et retourne à l'accueil",
    cancel_desc_updates: "Applique les mises à jour sans redémarrer",
    scheduled_title: "Redémarrage Planifié",
    scheduled_desc: "Exécution différée ou récurrente",
    with_updates: "Avec M.A.J",
    reboot_only: "Reboot seul",
    day_label: "Jour :",
    time_label: "Heure :",
    no_day: "Prochaine heure",
    recurring: "Récurrent",
    schedule_btn: "Planifier",
    cancel_sched_btn: "Annuler",
    choose_day: "Choisir le jour",
    choose_time_hour: "Choisir l'heure (1/2)",
    choose_time_min: "Choisir les minutes (2/2)",
    select_hour: "Sélectionnez l'heure :",
    select_min: "Sélectionnez les minutes :",
    days: ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"],
    active_sched_prefix: "Planifié pour",
    active_sched_recurring: "Récurrent",
    active_sched_once: "Une seule fois",
    active_sched_updates: "Mises à jour incluses",
    active_sched_no_updates: "Redémarrage seul",
    intercept_alert: "⚠️ Redémarrage automatique intercepté avec succès : en attente de la fin des autres MAJ.",
    processing: "Traitement en cours...",
    global_progress: "Progression globale",
    item_progress: "Élément en cours",
    easter_egg_hint: "Cliquez 3 fois sur SOCRATE RULES pour quitter",
    easter_egg_sub: "Une expérience visuelle <strong>hautement philosophique</strong>.",
    easter_egg_instructions: "Bougez votre souris & cliquez n'importe où",
    sched_success: "Planification enregistrée avec succès !",
    sched_cancelled: "Planification annulée."
  },
  en: {
    panel_title: "Restart HA",
    panel_subtitle: "Restart options & updates management",
    update_all_title: "Update all",
    update_all_desc: "Apply selected updates before action (intercepts automatic reboots)",
    selected_count: "{count} selected",
    available_updates: "Available updates",
    toggle_all: "Toggle all",
    quick_restart: "Quick Restart",
    quick_restart_desc: "Restart Home Assistant immediately (without validation)",
    system_restart: "System Reboot",
    system_restart_desc: "Reboot full host (Home Assistant + OS)",
    safe_boot: "Safe Mode",
    safe_boot_desc: "Restart without custom components",
    cancel: "Cancel",
    cancel_desc: "Close window and return to dashboard",
    cancel_desc_updates: "Apply updates without rebooting",
    scheduled_title: "Scheduled Restart",
    scheduled_desc: "Delayed or recurring execution",
    with_updates: "With updates",
    reboot_only: "Reboot only",
    day_label: "Day:",
    time_label: "Time:",
    no_day: "Next occurrence",
    recurring: "Recurring",
    schedule_btn: "Schedule",
    cancel_sched_btn: "Cancel",
    choose_day: "Choose day",
    choose_time_hour: "Choose hour (1/2)",
    choose_time_min: "Choose minutes (2/2)",
    select_hour: "Select hour:",
    select_min: "Select minutes:",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    active_sched_prefix: "Scheduled for",
    active_sched_recurring: "Recurring",
    active_sched_once: "One time",
    active_sched_updates: "Updates included",
    active_sched_no_updates: "Restart only",
    intercept_alert: "⚠️ Automatic restart successfully intercepted: waiting for other updates.",
    processing: "Processing...",
    global_progress: "Global progress",
    item_progress: "Current item",
    easter_egg_hint: "Click 3 times on SOCRATE RULES to exit",
    easter_egg_sub: "A <strong>highly philosophical</strong> visual experience.",
    easter_egg_instructions: "Move your mouse & click anywhere",
    sched_success: "Schedule successfully registered!",
    sched_cancelled: "Schedule cancelled."
  },
  de: {
    panel_title: "Restart HA",
    panel_subtitle: "Neustart-Optionen & Update-Verwaltung",
    update_all_title: "Alles aktualisieren",
    update_all_desc: "Ausgewählte Updates vor der Aktion anwenden (blockiert automatische Neustarts)",
    selected_count: "{count} ausgewählt",
    available_updates: "Verfügbare Updates",
    toggle_all: "Alle umschalten",
    quick_restart: "Schneller Neustart",
    quick_restart_desc: "Home Assistant sofort neustarten (ohne Prüfung)",
    system_restart: "System-Neustart",
    system_restart_desc: "Gesamten Host neustarten (Home Assistant + Betriebssystem)",
    safe_boot: "Abgesicherter Modus",
    safe_boot_desc: "Ohne benutzerdefinierte Komponenten neustarten",
    cancel: "Abbrechen",
    cancel_desc: "Fenster schließen und zum Dashboard zurückkehren",
    cancel_desc_updates: "Updates ohne Neustart anwenden",
    scheduled_title: "Geplanter Neustart",
    scheduled_desc: "Verzögerte oder wiederkehrende Ausführung",
    with_updates: "Mit Updates",
    reboot_only: "Nur Neustart",
    day_label: "Tag:",
    time_label: "Uhrzeit:",
    no_day: "Nächste Uhrzeit",
    recurring: "Wiederkehrend",
    schedule_btn: "Planen",
    cancel_sched_btn: "Abbrechen",
    choose_day: "Tag auswählen",
    choose_time_hour: "Stunde wählen (1/2)",
    choose_time_min: "Minuten wählen (2/2)",
    select_hour: "Stunde auswählen:",
    select_min: "Minuten auswählen:",
    days: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"],
    active_sched_prefix: "Geplant für",
    active_sched_recurring: "Wiederkehrend",
    active_sched_once: "Einmalig",
    active_sched_updates: "Inklusive Updates",
    active_sched_no_updates: "Nur Neustart",
    intercept_alert: "⚠️ Automatischer Neustart erfolgreich abgefangen: Warten auf verbleibende Updates.",
    processing: "Verarbeitung läuft...",
    global_progress: "Gesamtfortschritt",
    item_progress: "Aktuelles Element",
    easter_egg_hint: "Klicken Sie dreimal auf SOCRATE RULES zum Beenden",
    easter_egg_sub: "Eine <strong>höchst philosophische</strong> visuelle Erfahrung.",
    easter_egg_instructions: "Maus bewegen & überall klicken",
    sched_success: "Zeitplan erfolgreich gespeichert!",
    sched_cancelled: "Zeitplan abgebrochen."
  },
  it: {
    panel_title: "Restart HA",
    panel_subtitle: "Opzioni di riavvio e gestione aggiornamenti",
    update_all_title: "Aggiorna tutto",
    update_all_desc: "Applica gli aggiornamenti selezionati prima dell'azione (intercetta i riavvii automatici)",
    selected_count: "{count} selezionati",
    available_updates: "Aggiornamenti disponibili",
    toggle_all: "Inverti selezione",
    quick_restart: "Riavvio Rapido",
    quick_restart_desc: "Riavvia Home Assistant immediatamente (senza conferma)",
    system_restart: "Riavvio di Sistema",
    system_restart_desc: "Riavvia l'intero host (Home Assistant + SO)",
    safe_boot: "Modalità Provvisoria",
    safe_boot_desc: "Riavvia senza componenti personalizzati",
    cancel: "Annulla",
    cancel_desc: "Chiudi la finestra e torna alla schermata principale",
    cancel_desc_updates: "Applica gli aggiornamenti senza riavviare",
    scheduled_title: "Riavvio Programmato",
    scheduled_desc: "Esecuzione posticipata o ricorrente",
    with_updates: "Con aggiornamenti",
    reboot_only: "Solo riavvio",
    day_label: "Giorno:",
    time_label: "Ora:",
    no_day: "Prossima ora",
    recurring: "Ricorrente",
    schedule_btn: "Pianifica",
    cancel_sched_btn: "Annulla",
    choose_day: "Scegli il giorno",
    choose_time_hour: "Scegli l'ora (1/2)",
    choose_time_min: "Scegli i minuti (2/2)",
    select_hour: "Seleziona l'ora:",
    select_min: "Seleziona i minuti:",
    days: ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"],
    active_sched_prefix: "Programmato per",
    active_sched_recurring: "Ricorrente",
    active_sched_once: "Una sola volta",
    active_sched_updates: "Aggiornamenti inclusi",
    active_sched_no_updates: "Solo riavvio",
    intercept_alert: "⚠️ Riavvio automatico intercettato con successo: in attesa degli altri aggiornamenti.",
    processing: "Elaborazione in corso...",
    global_progress: "Avanzamento globale",
    item_progress: "Elemento corrente",
    easter_egg_hint: "Fai triplo clic su SOCRATE RULES per uscire",
    easter_egg_sub: "Un'esperienza visiva <strong>altamente filosofica</strong>.",
    easter_egg_instructions: "Muovi il mouse e fai clic ovunque",
    sched_success: "Pianificazione salvata con successo!",
    sched_cancelled: "Pianificazione annullata."
  },
  es: {
    panel_title: "Restart HA",
    panel_subtitle: "Opciones de reinicio y gestión de actualizaciones",
    update_all_title: "Actualizar todo",
    update_all_desc: "Aplica las actualizaciones seleccionadas antes de la acción (intercepta reinicios automáticos)",
    selected_count: "{count} seleccionado{s}",
    available_updates: "Actualizaciones disponibles",
    toggle_all: "Alternar todo",
    quick_restart: "Reinicio Rápido",
    quick_restart_desc: "Reinicia Home Assistant inmediatamente (sin confirmación)",
    system_restart: "Reinicio del Sistema",
    system_restart_desc: "Reinicia el host completo (Home Assistant + SO)",
    safe_boot: "Modo Seguro",
    safe_boot_desc: "Reinicia sin componentes personalizados",
    cancel: "Cancelar",
    cancel_desc: "Cierra la ventana y vuelve al panel de control",
    cancel_desc_updates: "Aplica las actualizaciones sin reiniciar",
    scheduled_title: "Reinicio Programado",
    scheduled_desc: "Ejecución diferida o periódica",
    with_updates: "Con actualizaciones",
    reboot_only: "Solo reinicio",
    day_label: "Día:",
    time_label: "Hora:",
    no_day: "Próxima hora",
    recurring: "Periódico",
    schedule_btn: "Programar",
    cancel_sched_btn: "Cancelar",
    choose_day: "Elegir día",
    choose_time_hour: "Elegir hora (1/2)",
    choose_time_min: "Elegir minutos (2/2)",
    select_hour: "Selecciona la hora:",
    select_min: "Selecciona los minutos:",
    days: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"],
    active_sched_prefix: "Programado para",
    active_sched_recurring: "Periódico",
    active_sched_once: "Una sola vez",
    active_sched_updates: "Actualizaciones incluidas",
    active_sched_no_updates: "Solo reinicio",
    intercept_alert: "⚠️ Reinicio automático interceptado con éxito: esperando el fin de las otras actualizaciones.",
    processing: "Procesando...",
    global_progress: "Progreso global",
    item_progress: "Elemento actual",
    easter_egg_hint: "Haz triple clic en SOCRATE RULES para salir",
    easter_egg_sub: "Una experiencia visual <strong>altamente filosófica</strong>.",
    easter_egg_instructions: "Mueve el ratón y haz clic en cualquier lugar",
    sched_success: "¡Programación guardada con éxito!",
    sched_cancelled: "Programación cancelada."
  },
  uk: {
    panel_title: "Restart HA",
    panel_subtitle: "Опції перезапуску та керування оновленнями",
    update_all_title: "Оновити все",
    update_all_desc: "Встановити вибрані оновлення перед дією (блокує автоперезапуски)",
    selected_count: "{count} вибрано",
    available_updates: "Доступні оновлення",
    toggle_all: "Перемкнути все",
    quick_restart: "Швидкий перезапуск",
    quick_restart_desc: "Перезапуск Home Assistant негайно (без підтвердження)",
    system_restart: "Перезапуск системи",
    system_restart_desc: "Перезапуск усього хоста (Home Assistant + ОС)",
    safe_boot: "Безпечний режим",
    safe_boot_desc: "Перезапуск без сторонніх інтеграцій",
    cancel: "Скасувати",
    cancel_desc: "Закрити вікно та повернутися на головну",
    cancel_desc_updates: "Застосувати оновлення без перезапуску",
    scheduled_title: "Запланований перезапуск",
    scheduled_desc: "Відкладене або повторюване виконання",
    with_updates: "З оновленнями",
    reboot_only: "Лише перезапуск",
    day_label: "День:",
    time_label: "Час:",
    no_day: "Найближчий час",
    recurring: "Повторювати",
    schedule_btn: "Запланувати",
    cancel_sched_btn: "Скасувати",
    choose_day: "Оберіть день",
    choose_time_hour: "Оберіть годину (1/2)",
    choose_time_min: "Оберіть хвилини (2/2)",
    select_hour: "Виберіть годину:",
    select_min: "Виберіть хвилини:",
    days: ["Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота", "Неділя"],
    active_sched_prefix: "Заплановано на",
    active_sched_recurring: "Повторюваний",
    active_sched_once: "Одноразово",
    active_sched_updates: "Включно з оновленнями",
    active_sched_no_updates: "Лише перезапуск",
    intercept_alert: "⚠️ Автоматичний перезапуск успішно перехоплено: очікування завершення інших оновлень.",
    processing: "Обробка...",
    global_progress: "Загальний прогрес",
    item_progress: "Поточний елемент",
    easter_egg_hint: "Тричі натисніть на SOCRATE RULES для виходу",
    easter_egg_sub: "Візуальний досвід <strong>високої філософії</strong>.",
    easter_egg_instructions: "Рухайте мишкою та клацайте будь-де",
    sched_success: "Розклад успішно збережено!",
    sched_cancelled: "Розклад скасовано."
  }
};

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
    this._selectedHour = "04";
    this._selectedMinute = "00";
    this._selectedDay = null; // null = next occurrence (no day specified), 0=Mon..6=Sun
    this._recurring = false;
    this._tempHour = "04";
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


  _getLang() {
    const haLang = this._hass?.language || this._hass?.locale?.language || navigator.language || "fr";
    const code = haLang.substring(0, 2).toLowerCase();
    return TRANSLATIONS[code] ? code : "fr";
  }

  t(key, params = {}) {
    const lang = this._getLang();
    let str = TRANSLATIONS[lang]?.[key] || TRANSLATIONS["fr"]?.[key] || TRANSLATIONS["en"]?.[key] || key;
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
    return str;
  }

  _applyTranslations() {
    if (!this._el) return;
    if (this._el.panelSubtitle) this._el.panelSubtitle.textContent = this.t("panel_subtitle");
    if (this._el.updateAllTitle) this._el.updateAllTitle.textContent = this.t("update_all_title");
    if (this._el.updateAllDesc) this._el.updateAllDesc.textContent = this.t("update_all_desc");
    if (this._el.updatesSummaryTitle) this._el.updatesSummaryTitle.textContent = this.t("available_updates");
    if (this._el.selectToggleBtn) this._el.selectToggleBtn.textContent = this.t("toggle_all");

    if (this._el.quickBtnTitle) this._el.quickBtnTitle.textContent = this.t("quick_restart");
    if (this._el.quickBtnDesc) this._el.quickBtnDesc.textContent = this.t("quick_restart_desc");
    if (this._el.systemBtnTitle) this._el.systemBtnTitle.textContent = this.t("system_restart");
    if (this._el.systemBtnDesc) this._el.systemBtnDesc.textContent = this.t("system_restart_desc");
    if (this._el.safeBtnTitle) this._el.safeBtnTitle.textContent = this.t("safe_boot");
    if (this._el.safeBtnDesc) this._el.safeBtnDesc.textContent = this.t("safe_boot_desc");
    if (this._el.cancelBtnTitle) this._el.cancelBtnTitle.textContent = this.t("cancel");

    if (this._el.schedTitle) this._el.schedTitle.textContent = this.t("scheduled_title");
    if (this._el.schedDesc) this._el.schedDesc.textContent = this.t("scheduled_desc");
    if (this._el.dayPickerLabel) this._el.dayPickerLabel.textContent = this.t("day_label");
    if (this._el.timePickerLabel) this._el.timePickerLabel.textContent = this.t("time_label");
    if (this._el.recurringText) this._el.recurringText.textContent = this.t("recurring");
    if (this._el.scheduleBtnText) this._el.scheduleBtnText.textContent = this.t("schedule_btn");
    if (this._el.cancelSchedBtn) this._el.cancelSchedBtn.textContent = this.t("cancel_sched_btn");
    if (this._el.chooseDayTitle) this._el.chooseDayTitle.textContent = this.t("choose_day");
    if (this._el.hourStepHint) this._el.hourStepHint.textContent = this.t("select_hour");
    if (this._el.minuteStepHint) this._el.minuteStepHint.textContent = this.t("select_min");

    const dayNames = this.t("days");
    if (this._selectedDay === null) {
      if (this._el.dayPickerValue) this._el.dayPickerValue.textContent = this.t("no_day");
    } else if (dayNames[this._selectedDay]) {
      if (this._el.dayPickerValue) this._el.dayPickerValue.textContent = dayNames[this._selectedDay];
    }
  }

  _toggleDayPicker() {
    if (this._el.dayPickerPopover.style.display === "block") {
      this._el.dayPickerPopover.style.display = "none";
    } else {
      this._el.timePickerPopover.style.display = "none";
      this._renderDayOptions();
      this._el.dayPickerPopover.style.display = "block";
    }
  }

  _renderDayOptions() {
    const list = this._el.dayOptionsList;
    if (!list) return;
    list.innerHTML = "";
    const dayNames = this.t("days");

    const noDayItem = document.createElement("div");
    noDayItem.className = "day-option-item" + (this._selectedDay === null ? " selected" : "");
    noDayItem.innerHTML = `<span>🌟 ${this.t("no_day")}</span>${this._selectedDay === null ? '<span class="check-icon">✓</span>' : ''}`;
    noDayItem.onclick = (e) => {
      e.stopPropagation();
      this._selectedDay = null;
      this._el.dayPickerValue.textContent = this.t("no_day");
      this._el.dayPickerPopover.style.display = "none";
    };
    list.appendChild(noDayItem);

    dayNames.forEach((dName, idx) => {
      const item = document.createElement("div");
      item.className = "day-option-item" + (this._selectedDay === idx ? " selected" : "");
      item.innerHTML = `<span>📅 ${dName}</span>${this._selectedDay === idx ? '<span class="check-icon">✓</span>' : ''}`;
      item.onclick = (e) => {
        e.stopPropagation();
        this._selectedDay = idx;
        this._el.dayPickerValue.textContent = dName;
        this._el.dayPickerPopover.style.display = "none";
      };
      list.appendChild(item);
    });
  }

  _toggleTimePicker() {
    if (this._el.timePickerPopover.style.display === "block") {
      this._el.timePickerPopover.style.display = "none";
    } else {
      this._el.dayPickerPopover.style.display = "none";
      this._showHourStep();
      this._el.timePickerPopover.style.display = "block";
    }
  }

  _showHourStep() {
    this._el.chooseTimeTitle.textContent = this.t("choose_time_hour");
    this._el.timeHourStep.style.display = "block";
    this._el.timeMinuteStep.style.display = "none";

    const grid = this._el.hourGrid;
    grid.innerHTML = "";
    for (let h = 0; h < 24; h++) {
      const hStr = String(h).padStart(2, "0");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "time-btn" + (this._selectedHour === hStr ? " selected" : "");
      btn.textContent = hStr;
      btn.onclick = (e) => {
        e.stopPropagation();
        this._tempHour = hStr;
        this._showMinuteStep();
      };
      grid.appendChild(btn);
    }
  }

  _showMinuteStep() {
    this._el.chooseTimeTitle.textContent = `${this.t("choose_time_min")} (${this._tempHour}:__)`;
    this._el.timeHourStep.style.display = "none";
    this._el.timeMinuteStep.style.display = "block";

    const grid = this._el.minuteGrid;
    grid.innerHTML = "";
    const minutes = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
    minutes.forEach((mStr) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "time-btn" + (this._selectedMinute === mStr ? " selected" : "");
      btn.textContent = mStr;
      btn.onclick = (e) => {
        e.stopPropagation();
        this._selectedHour = this._tempHour;
        this._selectedMinute = mStr;
        this._el.timePickerValue.textContent = `${this._selectedHour}:${this._selectedMinute}`;
        this._el.timePickerPopover.style.display = "none";
      };
      grid.appendChild(btn);
    });
  }

  async _handleScheduleRestart() {
    if (!this._hass) return;

    const updates = this._status.available_updates || this._scanAvailableUpdates();
    const selectedList = updates
      .filter((u) => this._selectedEntityIds.has(u.entity_id))
      .map((u) => u.entity_id);

    const shouldUpdate = this._updateAllChecked && selectedList.length > 0;
    const scheduleTime = `${this._selectedHour}:${this._selectedMinute}`;
    const scheduleDay = this._selectedDay;
    const recurring = this._recurring;

    try {
      await this._hass.callWS({
        type: "restart_ha/start_process",
        action: "schedule_restart",
        update_all: shouldUpdate,
        entity_ids: selectedList,
        schedule_time: scheduleTime,
        schedule_day: scheduleDay,
        recurring: recurring,
      });

      const dayNames = this.t("days");
      const dayStr = scheduleDay !== null && dayNames[scheduleDay] ? ` (${dayNames[scheduleDay]})` : "";
      const recStr = recurring ? ` • ${this.t("active_sched_recurring")}` : "";
      const updStr = shouldUpdate ? ` • ${this.t("with_updates")}` : ` • ${this.t("reboot_only")}`;

      this._status.status_message = `${this.t("sched_success")} : ${scheduleTime}${dayStr}${recStr}${updStr}`;
      this._updateUI();
    } catch (e) {
      console.error("Schedule error:", e);
      alert("Erreur de planification : " + (e.message || e));
    }
  }

  async _cancelSchedule() {
    if (!this._hass) return;
    try {
      await this._hass.callWS({ type: "restart_ha/cancel_schedule" });
      this._status.scheduled_job = null;
      this._status.status_message = this.t("sched_cancelled");
      this._updateUI();
    } catch (e) {
      console.error("Cancel schedule error:", e);
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
        await this._handleScheduleRestart();
        return;
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

        /* Schedule Box Styles */
        .schedule-box {
          margin-bottom: 18px;
          padding: 14px 16px;
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          position: relative;
          backdrop-filter: blur(10px);
        }

        .schedule-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .sched-mode-badge {
          font-size: 11px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 9999px;
          letter-spacing: 0.3px;
          text-transform: uppercase;
        }

        .badge-with-updates {
          background: rgba(56, 189, 248, 0.18);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.35);
        }

        .badge-reboot-only {
          background: rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        /* Active Schedule Banner */
        .active-sched-card {
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(99, 102, 241, 0.15));
          border: 1px solid rgba(56, 189, 248, 0.4);
          border-radius: 10px;
          padding: 10px 14px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .active-sched-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .active-sched-icon {
          font-size: 20px;
        }

        .btn-cancel-sched {
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #fca5a5;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-cancel-sched:hover {
          background: rgba(239, 68, 68, 0.35);
          color: #ffffff;
        }

        /* Controls Row */
        .schedule-controls {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
        }

        .picker-trigger-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 8px;
          color: #ffffff;
          padding: 7px 12px;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: background 0.2s, border-color 0.2s;
        }

        .picker-trigger-btn:hover {
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(56, 189, 248, 0.5);
        }

        .picker-label {
          color: #94a3b8;
          font-size: 12px;
        }

        .picker-value {
          font-weight: 600;
          color: #38bdf8;
        }

        .recurring-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: #e2e8f0;
          cursor: pointer;
          user-select: none;
          margin-left: 2px;
        }

        .recurring-label input {
          accent-color: #38bdf8;
          width: 16px;
          height: 16px;
          cursor: pointer;
        }

        .btn-schedule-action {
          margin-left: auto;
          background: linear-gradient(135deg, #0284c7, #0369a1);
          color: white;
          border: none;
          border-radius: 8px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: transform 0.15s, background 0.2s;
          box-shadow: 0 4px 10px rgba(2, 132, 199, 0.3);
        }

        .btn-schedule-action:hover {
          background: linear-gradient(135deg, #0369a1, #075985);
          transform: translateY(-1px);
        }

        /* Popovers */
        .picker-popover {
          position: absolute;
          top: 100%;
          left: 12px;
          margin-top: 8px;
          z-index: 9999;
          background: #1e293b;
          border: 1px solid rgba(56, 189, 248, 0.4);
          border-radius: 12px;
          padding: 14px;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
          min-width: 270px;
          backdrop-filter: blur(12px);
        }

        .popover-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
          font-weight: 600;
          color: #e2e8f0;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .popover-close {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 14px;
          padding: 2px 6px;
        }

        .popover-close:hover {
          color: #ffffff;
        }

        .step-hint {
          font-size: 11px;
          color: #94a3b8;
          margin-bottom: 8px;
        }

        .time-grid {
          display: grid;
          gap: 6px;
        }

        .hour-grid {
          grid-template-columns: repeat(6, 1fr);
        }

        .minute-grid {
          grid-template-columns: repeat(4, 1fr);
        }

        .time-btn {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 6px;
          color: #ffffff;
          padding: 7px 4px;
          font-size: 12px;
          font-family: monospace;
          cursor: pointer;
          text-align: center;
          transition: all 0.15s ease;
        }

        .time-btn:hover {
          background: rgba(56, 189, 248, 0.25);
          border-color: #38bdf8;
          color: #ffffff;
          transform: scale(1.05);
        }

        .time-btn.selected {
          background: #0284c7;
          border-color: #38bdf8;
          font-weight: 700;
        }

        .day-options-list {
          display: flex;
          flex-direction: column;
          gap: 5px;
          max-height: 240px;
          overflow-y: auto;
        }

        .day-option-item {
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 13px;
          color: #e2e8f0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid transparent;
          transition: background 0.15s, border-color 0.15s;
        }

        .day-option-item:hover {
          background: rgba(56, 189, 248, 0.2);
          border-color: rgba(56, 189, 248, 0.4);
          color: #ffffff;
        }

        .day-option-item.selected {
          background: rgba(56, 189, 248, 0.25);
          border-color: #38bdf8;
          font-weight: 600;
          color: #38bdf8;
        }

        .check-icon {
          color: #38bdf8;
          font-weight: bold;
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
                <div class="header-subtitle" id="headerSubtitle">Options de redémarrage & gestion des mises à jour</div>
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
                    <span id="updateAllTitle">Mettre tout à jour</span>
                    <span class="badge-count" id="badgeCount" style="display: none;">0 sélectionnés</span>
                  </h4>
                  <p id="updateAllDesc">Applique les mises à jour sélectionnées avant l'action (bloque les redémarrages auto)</p>
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

            <!-- Schedule UI Box -->
            <div class="schedule-box" id="scheduleBox">
              <div class="schedule-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <svg style="width: 20px; height: 20px; fill: #38bdf8;" viewBox="0 0 24 24"><path d="M12 20C16.4 20 20 16.4 20 12C20 7.6 16.4 4 12 4C7.6 4 4 7.6 4 12C4 16.4 7.6 20 12 20M12 2C17.5 2 22 6.5 22 12C22 17.5 17.5 22 12 22C6.5 22 2 17.5 2 12C2 6.5 6.5 2 12 2M12.5 7V12.2L17 14.9L16.2 16.1L11 13V7H12.5Z"/></svg>
                  <div>
                    <strong id="schedTitle" style="display: block; font-size: 14px;">Redémarrage Planifié</strong>
                    <span id="schedDesc" style="font-size: 11px; color: #94a3b8;">Exécution différée ou récurrente</span>
                  </div>
                </div>
                <div id="schedModeBadge" class="sched-mode-badge badge-with-updates">Avec M.A.J</div>
              </div>

              <!-- Active Schedule Card -->
              <div class="active-sched-card" id="activeSchedCard" style="display: none;">
                <div class="active-sched-info">
                  <span class="active-sched-icon">⏰</span>
                  <div>
                    <div id="activeSchedText" style="font-size: 13px; font-weight: 600; color: #38bdf8;">Planifié</div>
                    <div id="activeSchedDetails" style="font-size: 11px; color: #cbd5e1;">Détails</div>
                  </div>
                </div>
                <button type="button" class="btn-cancel-sched" id="cancelSchedBtn">Annuler</button>
              </div>

              <!-- Controls Row -->
              <div class="schedule-controls" id="schedControls">
                <!-- Day Button -->
                <button type="button" class="picker-trigger-btn" id="dayPickerBtn" title="Choisir le jour">
                  <span class="picker-label" id="dayPickerLabel">Jour :</span>
                  <span class="picker-value" id="dayPickerValue">Prochaine heure</span>
                  <svg style="width: 14px; height: 14px; fill: currentColor; margin-left: 2px;" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
                </button>

                <!-- Time Button -->
                <button type="button" class="picker-trigger-btn" id="timePickerBtn" title="Choisir l'heure">
                  <span class="picker-label" id="timePickerLabel">Heure :</span>
                  <span class="picker-value" id="timePickerValue">04:00</span>
                  <svg style="width: 14px; height: 14px; fill: currentColor; margin-left: 2px;" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
                </button>

                <!-- Recurrence -->
                <label class="recurring-label">
                  <input type="checkbox" id="scheduleRecurringCb">
                  <span id="recurringText">Récurrent</span>
                </label>

                <!-- Schedule Action Button -->
                <button type="button" class="btn-schedule-action" id="scheduleBtn">
                  <span id="scheduleBtnText">Planifier</span>
                </button>
              </div>

              <!-- Day Popover -->
              <div class="picker-popover" id="dayPickerPopover" style="display: none;">
                <div class="popover-header">
                  <span id="chooseDayTitle">Choisir le jour</span>
                  <button type="button" class="popover-close" id="closeDayPicker">✕</button>
                </div>
                <div class="day-options-list" id="dayOptionsList"></div>
              </div>

              <!-- Time Popover -->
              <div class="picker-popover" id="timePickerPopover" style="display: none;">
                <div class="popover-header">
                  <span id="chooseTimeTitle">Choisir l'heure (1/2)</span>
                  <button type="button" class="popover-close" id="closeTimePicker">✕</button>
                </div>
                <div id="timeHourStep">
                  <div class="step-hint" id="hourStepHint">Sélectionnez l'heure :</div>
                  <div class="time-grid hour-grid" id="hourGrid"></div>
                </div>
                <div id="timeMinuteStep" style="display: none;">
                  <div class="step-hint" id="minuteStepHint">Sélectionnez les minutes :</div>
                  <div class="time-grid minute-grid" id="minuteGrid"></div>
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
                    <span class="btn-title" id="quickBtnTitle">Redémarrage Rapide</span>
                    <span class="btn-desc" id="quickBtnDesc">Redémarre Home Assistant immédiatement (sans validation)</span>
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
                    <span class="btn-title" id="systemBtnTitle">Redémarrage Système</span>
                    <span class="btn-desc" id="systemBtnDesc">Redémarre l'hôte complet (Home Assistant + OS)</span>
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
                    <span class="btn-title" id="safeBtnTitle">Mode Sans Échec</span>
                    <span class="btn-desc" id="safeBtnDesc">Redémarre sans les composants personnalisés</span>
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
                    <span class="btn-title" id="cancelBtnTitle">Annuler</span>
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
      headerTitle: root.getElementById("headerTitle"),
      panelSubtitle: root.getElementById("headerSubtitle"),
      updateAllCb: root.getElementById("updateAllCb"),
      updateAllTitle: root.getElementById("updateAllTitle"),
      updateAllDesc: root.getElementById("updateAllDesc"),
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
      quickBtnTitle: root.getElementById("quickBtnTitle"),
      quickBtnDesc: root.getElementById("quickBtnDesc"),
      systemBtn: root.getElementById("systemRestartBtn"),
      systemBtnTitle: root.getElementById("systemBtnTitle"),
      systemBtnDesc: root.getElementById("systemBtnDesc"),
      safeBtn: root.getElementById("safeBootBtn"),
      safeBtnTitle: root.getElementById("safeBtnTitle"),
      safeBtnDesc: root.getElementById("safeBtnDesc"),
      cancelBtn: root.getElementById("cancelBtn"),
      cancelBtnTitle: root.getElementById("cancelBtnTitle"),
      cancelBtnDesc: root.getElementById("cancelBtnDesc"),

      // Schedule elements
      schedBox: root.getElementById("scheduleBox"),
      schedTitle: root.getElementById("schedTitle"),
      schedDesc: root.getElementById("schedDesc"),
      schedModeBadge: root.getElementById("schedModeBadge"),
      activeSchedCard: root.getElementById("activeSchedCard"),
      activeSchedText: root.getElementById("activeSchedText"),
      activeSchedDetails: root.getElementById("activeSchedDetails"),
      cancelSchedBtn: root.getElementById("cancelSchedBtn"),
      dayPickerBtn: root.getElementById("dayPickerBtn"),
      dayPickerLabel: root.getElementById("dayPickerLabel"),
      dayPickerValue: root.getElementById("dayPickerValue"),
      timePickerBtn: root.getElementById("timePickerBtn"),
      timePickerLabel: root.getElementById("timePickerLabel"),
      timePickerValue: root.getElementById("timePickerValue"),
      scheduleRecurringCb: root.getElementById("scheduleRecurringCb"),
      recurringText: root.getElementById("recurringText"),
      scheduleBtn: root.getElementById("scheduleBtn"),
      scheduleBtnText: root.getElementById("scheduleBtnText"),
      dayPickerPopover: root.getElementById("dayPickerPopover"),
      closeDayPicker: root.getElementById("closeDayPicker"),
      dayOptionsList: root.getElementById("dayOptionsList"),
      timePickerPopover: root.getElementById("timePickerPopover"),
      closeTimePicker: root.getElementById("closeTimePicker"),
      chooseDayTitle: root.getElementById("chooseDayTitle"),
      chooseTimeTitle: root.getElementById("chooseTimeTitle"),
      timeHourStep: root.getElementById("timeHourStep"),
      hourStepHint: root.getElementById("hourStepHint"),
      hourGrid: root.getElementById("hourGrid"),
      timeMinuteStep: root.getElementById("timeMinuteStep"),
      minuteStepHint: root.getElementById("minuteStepHint"),
      minuteGrid: root.getElementById("minuteGrid"),
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
    this._el.cancelBtn.onclick = () => this._handleAction("cancel");

    // Schedule events
    this._el.dayPickerBtn.onclick = (e) => {
      e.stopPropagation();
      this._toggleDayPicker();
    };
    this._el.timePickerBtn.onclick = (e) => {
      e.stopPropagation();
      this._toggleTimePicker();
    };
    this._el.closeDayPicker.onclick = (e) => {
      e.stopPropagation();
      this._el.dayPickerPopover.style.display = "none";
    };
    this._el.closeTimePicker.onclick = (e) => {
      e.stopPropagation();
      this._el.timePickerPopover.style.display = "none";
    };
    this._el.scheduleRecurringCb.onchange = (e) => {
      this._recurring = e.target.checked;
    };
    this._el.scheduleBtn.onclick = () => this._handleScheduleRestart();
    this._el.cancelSchedBtn.onclick = () => this._cancelSchedule();

    // Close popovers on click outside
    this.shadowRoot.addEventListener("click", (e) => {
      if (this._el.dayPickerPopover && !this._el.dayPickerPopover.contains(e.target) && e.target !== this._el.dayPickerBtn) {
        this._el.dayPickerPopover.style.display = "none";
      }
      if (this._el.timePickerPopover && !this._el.timePickerPopover.contains(e.target) && e.target !== this._el.timePickerBtn) {
        this._el.timePickerPopover.style.display = "none";
      }
    });

    this._applyTranslations();
  }

  _updateUI() {
    if (!this._el) return;

    this._applyTranslations();

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
      this._el.badgeCount.textContent = this.t("selected_count", { count: selectedCount, s: selectedCount > 1 ? "s" : "" });
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
      this._el.cancelBtnDesc.textContent = this.t("cancel_desc_updates");
    } else {
      this._el.cancelBtnDesc.textContent = this.t("cancel_desc");
    }

    // Sync schedModeBadge
    if (this._updateAllChecked && selectedCount > 0) {
      this._el.schedModeBadge.textContent = this.t("with_updates");
      this._el.schedModeBadge.className = "sched-mode-badge badge-with-updates";
    } else {
      this._el.schedModeBadge.textContent = this.t("reboot_only");
      this._el.schedModeBadge.className = "sched-mode-badge badge-reboot-only";
    }

    // Sync active schedule banner
    const sched = this._status.scheduled_job;
    if (sched && sched.next_run) {
      this._el.activeSchedCard.style.display = "flex";
      const nextDate = new Date(sched.next_run);
      const dayNames = this.t("days");
      const dayName = !isNaN(nextDate.getDay()) ? dayNames[(nextDate.getDay() + 6) % 7] : "";
      const timeStr = `${String(nextDate.getHours()).padStart(2, "0")}:${String(nextDate.getMinutes()).padStart(2, "0")}`;
      const dateStr = `${String(nextDate.getDate()).padStart(2, "0")}/${String(nextDate.getMonth() + 1).padStart(2, "0")}`;

      this._el.activeSchedText.textContent = `${this.t("active_sched_prefix")} ${dayName} ${dateStr} à ${timeStr}`;

      const recText = sched.recurring ? this.t("active_sched_recurring") : this.t("active_sched_once");
      const updText = sched.update_all ? this.t("active_sched_updates") : this.t("active_sched_no_updates");
      this._el.activeSchedDetails.textContent = `${recText} • ${updText}`;
    } else {
      this._el.activeSchedCard.style.display = "none";
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
      #socrate-rules-overlay p.socrate-exit-hint {
        font-size: 0.95rem;
        color: rgba(255, 255, 255, 0.6);
        margin-top: 16px;
        letter-spacing: 2px;
        text-transform: uppercase;
        font-weight: 300;
        opacity: 0;
        animation: socrate-fadeIn 2s ease forwards 1.1s;
        cursor: pointer;
      }
      #socrate-rules-overlay p.socrate-exit-hint strong {
        color: #ff007f;
        font-weight: 700;
        text-shadow: 0 0 10px rgba(255, 0, 127, 0.6);
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
        #socrate-rules-overlay p.socrate-exit-hint {
          font-size: 0.75rem;
          letter-spacing: 1px;
        }
      }
    </style>
    <canvas id="socrateParticleCanvas"></canvas>
    <div class="socrate-container">
      <h1 class="socrate-title" id="socrateTitle">Socrate Rules</h1>
      <p class="socrate-sub" id="socrateSub">Une expérience visuelle <strong>hautement philosophique</strong>.</p>
      <p class="socrate-exit-hint" id="socrateExitHint">Cliquez 3 fois sur <strong>SOCRATE RULES</strong> pour quitter</p>
    </div>
    <div class="socrate-instructions" id="socrateInstructions">Bougez votre souris & cliquez n'importe où</div>
  `;

  targetRoot.appendChild(overlay);

  // Localize easter egg strings if host has translation helper
  const host = targetRoot.host;
  if (host && typeof host.t === "function") {
    const subEl = overlay.querySelector("#socrateSub");
    const hintEl = overlay.querySelector("#socrateExitHint");
    const instEl = overlay.querySelector("#socrateInstructions");
    if (subEl) subEl.innerHTML = host.t("easter_egg_sub");
    if (hintEl) hintEl.textContent = host.t("easter_egg_hint");
    if (instEl) instEl.textContent = host.t("easter_egg_instructions");
  }

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

  const exitHint = overlay.querySelector("#socrateExitHint");
  if (exitHint) {
    exitHint.addEventListener("click", (e) => {
      e.stopPropagation();
      handleExitClick(e.clientX, e.clientY);
    });
    exitHint.addEventListener(
      "touchstart",
      (e) => {
        e.stopPropagation();
        const touch = e.touches && e.touches[0];
        handleExitClick(touch ? touch.clientX : null, touch ? touch.clientY : null);
      },
      { passive: true }
    );
  }

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
