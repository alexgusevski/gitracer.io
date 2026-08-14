const HANDLE_PATTERN = /^(?!-)(?!.*--)[A-Za-z0-9-]{1,39}(?<!-)$/;
const MAX_HANDLE_LENGTH = 39;
export const MAX_RACERS = 12;
const MAX_RACE_INPUT_LENGTH = MAX_RACERS * (MAX_HANDLE_LENGTH + 1) + (MAX_RACERS - 1);

export class InvalidRaceError extends Error {
  readonly status = 400;
}

export function normalizeHandle(value: string): string | null {
  const handle = value.trim().replace(/^@/, '');
  if (!HANDLE_PATTERN.test(handle)) return null;
  return handle.toLowerCase();
}

export function parseRaceSlug(raw: string | undefined): string[] {
  if (!raw || raw.length > MAX_RACE_INPUT_LENGTH) throw new InvalidRaceError('Add at least one GitHub username.');
  const values = raw.split('+');
  if (values.length < 1 || values.length > MAX_RACERS) {
    throw new InvalidRaceError(`A race can have between 1 and ${MAX_RACERS} people.`);
  }

  const handles: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const handle = normalizeHandle(value);
    if (!handle) throw new InvalidRaceError(`“${value.slice(0, 40)}” is not a valid GitHub username.`);
    if (!seen.has(handle)) {
      handles.push(handle);
      seen.add(handle);
    }
  }
  if (handles.length === 0) throw new InvalidRaceError('Add at least one GitHub username.');
  return handles;
}

export function raceSlug(handles: string[]): string {
  return handles.map((handle) => normalizeHandle(handle)).filter((handle): handle is string => Boolean(handle)).join('+');
}
