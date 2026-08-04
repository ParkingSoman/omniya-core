const elements = {
  image: document.getElementById('snapshot-image'),
  status: document.getElementById('snapshot-status'),
  aria: document.getElementById('snapshot-aria'),
  html: document.getElementById('snapshot-html'),
  metadata: document.getElementById('snapshot-metadata'),
  error: document.getElementById('snapshot-error'),
  reload: document.getElementById('reload-snapshot')
};

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
  elements.status.textContent = 'Snapshot unavailable';
}

async function loadSnapshot() {
  elements.reload.disabled = true;
  elements.error.hidden = true;
  elements.status.textContent = 'Loading snapshot…';
  try {
    const snapshot = await window.omniya.loadTestSnapshot();
    elements.image.src = snapshot.screenshot;
    elements.image.hidden = false;
    elements.aria.textContent = snapshot.aria;
    elements.html.textContent = snapshot.html;
    elements.metadata.textContent = snapshot.metadata;
    elements.status.textContent = 'Snapshot loaded';
  } catch {
    elements.image.hidden = true;
    elements.aria.textContent = '';
    elements.html.textContent = '';
    elements.metadata.textContent = '';
    showError('Run npm run test:inspect first to create a snapshot.');
  } finally {
    elements.reload.disabled = false;
  }
}

elements.reload.addEventListener('click', () => void loadSnapshot());
void loadSnapshot();
