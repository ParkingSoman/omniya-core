const MANIFEST_URL = 'https://github.com/ParkingSoman/omniya-core/releases/download/testing-app/version.json';
export const RELEASE_PAGE_URL = 'https://github.com/ParkingSoman/omniya-core/releases/tag/testing-app';

const ALPHA_VERSION_RE = /^\d+\.\d+\.\d+-alpha\.(\d+)(?:\+.+)?$/;

export function parseAlphaOrdinal(version) {
  const match = ALPHA_VERSION_RE.exec(String(version ?? ''));
  return match ? Number(match[1]) : null;
}

export function isNewerAlphaBuild(candidateVersion, currentVersion) {
  const candidate = parseAlphaOrdinal(candidateVersion);
  const current = parseAlphaOrdinal(currentVersion);
  if (candidate === null || current === null) return false;
  return candidate > current;
}

export async function checkForNewerMacBuild(currentVersion, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const manifestUrl = options.manifestUrl ?? MANIFEST_URL;
  const releaseUrl = options.releaseUrl ?? RELEASE_PAGE_URL;

  const response = await fetchImpl(manifestUrl, { headers: { 'cache-control': 'no-cache' } });
  if (!response.ok) return { available: false };

  const { version } = await response.json();
  return {
    available: isNewerAlphaBuild(version, currentVersion),
    latestVersion: version,
    releaseUrl
  };
}
