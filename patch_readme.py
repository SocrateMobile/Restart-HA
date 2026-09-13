import re

with open("README.md", "r") as f:
    content = f.read()

new_features = """  - **⏱️ Redémarrage Planifié** : Choisissez une heure précise pour différer le redémarrage.
  - **🛡️ Mode Sans Échec** : Lancez HA sans les composants personnalisés (custom_components) en cas de problème.
"""

content = content.replace("  - **❌ Annuler** : Ferme la popin et revient directement à l'accueil / tableau de bord Lovelace.", "  - **❌ Annuler** : Ferme la popin et revient directement à l'accueil / tableau de bord Lovelace.\n" + new_features)

with open("README.md", "w") as f:
    f.write(content)
