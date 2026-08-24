const STATE_ENDPOINT = '/api/state';
const SAVE_DEBOUNCE_MS = 800;

let saveTimer;
let inFlight = Promise.resolve();
let pendingState = null;
let statusListener = () => {};

export function onCloudStatus(listener) {
  statusListener = listener;
}

function report(status, message) {
  statusListener({ status, message });
}

export async function loadCloudState() {
  try {
    const response = await fetch(STATE_ENDPOINT, { cache: 'no-store', credentials: 'same-origin' });

    if (response.status === 401) {
      report('unauthorized', 'Not signed in to Cloudflare Access. Reload the page to sign in.');
      return { available: false, unauthorized: true, state: null };
    }

    if (!response.ok) {
      report('offline', 'Cloud sync unavailable. Working from this device only.');
      return { available: false, unauthorized: false, state: null };
    }

    const payload = await response.json();
    return {
      available: true,
      unauthorized: false,
      email: payload.email || '',
      state: payload.state || null,
      updatedAt: payload.updatedAt || null,
    };
  } catch {
    report('offline', 'Cloud sync unavailable. Working from this device only.');
    return { available: false, unauthorized: false, state: null };
  }
}

async function pushNow() {
  const state = pendingState;
  pendingState = null;
  if (!state) return;

  try {
    const response = await fetch(STATE_ENDPOINT, {
      method: 'PUT',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });

    if (response.status === 401) {
      report('unauthorized', 'Cloudflare Access session expired. Reload the page to sign in again.');
      return;
    }

    if (!response.ok) {
      report('error', 'Could not save to the cloud. Changes are still stored on this device.');
      return;
    }

    const payload = await response.json();
    report('saved', `Saved to the cloud at ${new Date(payload.updatedAt).toLocaleTimeString()}.`);
  } catch {
    report('error', 'Could not reach the cloud. Changes are still stored on this device.');
  }
}

export function queueCloudSave(state) {
  pendingState = state;
  report('saving', 'Saving to the cloud…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    inFlight = inFlight.then(pushNow);
  }, SAVE_DEBOUNCE_MS);
}

export function flushCloudSave() {
  clearTimeout(saveTimer);
  if (!pendingState) return inFlight;
  inFlight = inFlight.then(pushNow);
  return inFlight;
}
