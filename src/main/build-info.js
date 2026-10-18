/**
 * The words Help → About Omniya Core shows. Pure, so a test can check them.
 *
 * Three kinds of build exist, and the version tells them apart:
 *   0.1.0-alpha.<run>+<sha7>  the auto-updating alpha from `testing`
 *   0.1.0                     a pull-request test build (no version bump)
 *   anything else, or none    running from source
 */
export function describeBuild({ version, platform, arch }) {
  if (!version) {
    return { title: 'Omniya Core', message: 'Running from source. This is not an installed build.' };
  }
  const kind = /-alpha\.\d+/.test(version)
    ? 'Alpha build'
    : version === '0.1.0'
      ? 'Test build or release build'
      : 'Build';
  return {
    title: 'Omniya Core',
    message: `${kind}\nVersion ${version}\n${platform}, ${arch}`
  };
}
