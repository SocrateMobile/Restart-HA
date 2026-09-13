import re

with open("custom_components/restart_ha/frontend/restart-ha-panel.js", "r") as f:
    content = f.read()

bad_block = """    this._el.selectToggleBtn.onclick = () => this._toggleSelectAllItems();
    this._el.quickBtn.onclick = () => this._handleAction("quick_restart");
    this._el.systemBtn.onclick = () => this._handleAction("system_restart");
    this._el.safeBtn.onclick = () => this._handleAction("safe_boot");
    this._el.scheduleBtn.onclick = () => {
      if (!this._el.scheduleTime.value) {
        alert("Veuillez choisir une heure pour planifier.");
        return;
    this._el.selectToggleBtn.onclick = () => this._toggleSelectAllItems();
    this._el.quickBtn.onclick = () => this._handleAction("quick_restart");
    this._el.systemBtn.onclick = () => this._handleAction("system_restart");
    this._el.cancelBtn.onclick = () => this._handleAction("cancel");"""

good_block = """    this._el.selectToggleBtn.onclick = () => this._toggleSelectAllItems();
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
    this._el.cancelBtn.onclick = () => this._handleAction("cancel");"""

content = content.replace(bad_block, good_block)

with open("custom_components/restart_ha/frontend/restart-ha-panel.js", "w") as f:
    f.write(content)
