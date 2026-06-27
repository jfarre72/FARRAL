// Estado de la "Carga por voz" (activada/desactivada), guardado por dispositivo.
// Cuando está desactivada, el ítem del menú desaparece y la app no redirige
// automáticamente a la pantalla de carga al entrar.
export const VOZ_KEY = "farral_voz_enabled";

export function vozEnabled() {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(VOZ_KEY);
  return v === null ? true : v === "1"; // por defecto: activada
}

export function setVozEnabled(b) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VOZ_KEY, b ? "1" : "0");
  window.dispatchEvent(new Event("voz-config"));
}
