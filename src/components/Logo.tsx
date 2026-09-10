/**
 * Znak firmowy rysowany wprost w kodzie.
 *
 * Wcześniej był wstawiany jako <img> wskazujący plik obok. Po wdrożeniu
 * działało, ale w wersji zbudowanej do jednego pliku HTML nie miał czego
 * wczytać — a właśnie w takiej postaci kalkulator bywa przenoszony na
 * pulpit zdalny.
 */
export function Logo({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Kalkulator celów mieszanych"
    >
      <rect width="64" height="64" rx="14" fill="#1f5f8b" />
      <rect x="8" y="28" width="48" height="12" rx="5" fill="#ffffff" />
      <path d="M17 28 L22 19 Q23 17 25 17 L39 17 Q41 17 42 19 L47 28 Z" fill="#ffffff" />
      <circle cx="20" cy="41" r="5.5" fill="#ffffff" />
      <circle cx="44" cy="41" r="5.5" fill="#ffffff" />
      <circle cx="20" cy="41" r="2.2" fill="#1f5f8b" />
      <circle cx="44" cy="41" r="2.2" fill="#1f5f8b" />
      {/* Pasek koduje podział kosztu: 58,44% do działalności gospodarczej. */}
      <rect x="12" y="50" width="23.4" height="4" rx="2" fill="#4bbd85" />
      <rect x="36.6" y="50" width="15.4" height="4" rx="2" fill="#e2a274" />
    </svg>
  );
}
