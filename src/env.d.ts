/// <reference types="astro/client" />

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}

interface Window {
  posthog?: { capture?: (event: string, properties?: Record<string, unknown>) => void };
}

interface Navigator {
  readonly globalPrivacyControl?: boolean;
}
