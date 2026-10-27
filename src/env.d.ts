/// <reference types="astro/client" />

interface Window {
  /** Opens the "backend offline" notice. No network request is made. */
  gitracerOffline?: (trigger?: Element | null) => void;
}
