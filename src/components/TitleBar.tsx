/**
 * Pasek tytułu widoczny wyłącznie w zainstalowanej aplikacji.
 *
 * Gdy system odda aplikacji obszar paska tytułu, przeglądarka włącza tryb
 * window-controls-overlay i ten nagłówek zajmuje miejsce szarego paska
 * systemowego. W karcie przeglądarki pozostaje ukryty.
 */
export function TitleBar() {
  return (
    <header className="app-titlebar">
      <img className="app-titlebar__mark" src="./icons/icon.svg" alt="" width="16" height="16" />
      <span className="app-titlebar__name">Kalkulator celów mieszanych</span>
      <button type="button" className="app-titlebar__action" onClick={() => window.print()}>
        Drukuj dekret
      </button>
    </header>
  );
}
