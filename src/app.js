// Page wiring: load the outlook, pick the next session, render, and let the
// session strip switch between mornings and evenings.
import { SCORING, FORECAST } from './config.js';
import { load, currentSession } from './pipeline.js';
import { renderPage, renderError } from './render.js';

const TZ = FORECAST.display_timezone;

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const root = document.getElementById('app');
  const refresh = document.getElementById('refresh');
  let model = null;
  let selectedKey = null;

  const draw = () => renderPage(root, model, selectedKey, { timeZone: TZ, config: SCORING });

  const run = async () => {
    refresh.disabled = true;
    try {
      model = await load({ storage: safeStorage() });
      const stillThere = model.sessions.some((s) => s.key === selectedKey);
      if (!stillThere) selectedKey = currentSession(model).key;
      draw();
    } catch (err) {
      renderError(root, err);
    } finally {
      refresh.disabled = false;
    }
  };

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-session]');
    if (!button || !model) return;
    selectedKey = button.dataset.session;
    draw();
  });
  refresh.addEventListener('click', run);
  await run();
}

if (typeof document !== 'undefined') main();
