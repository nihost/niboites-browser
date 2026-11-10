/**
 * Applique le thème sauvegardé avant le premier paint (évite le flash).
 * Fichier externe requis : la CSP MV3 interdit les scripts inline.
 * Commun à popup.html et options.html.
 */
try {
  chrome.storage.local.get('niboites_theme').then(function (d) {
    document.documentElement.dataset.theme = d.niboites_theme === 'dark' ? 'dark' : 'light';
  });
} catch (e) {
  /* storage indisponible : thème clair par défaut */
}
