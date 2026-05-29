/**
 * Feature auto-loader.
 *
 * Scans subdirectories of this folder for feature.json manifests.
 * Each feature folder must contain:
 *   - feature.json  { id, mountPath, enabled }
 *   - routes.js     Express router (module.exports = router)
 *
 * To add a new feature: drop a new folder here with those two files.
 * To disable a feature: set "enabled": false in its feature.json.
 *
 * Returns an array of { id, mountPath, enabled, router } objects.
 * Only features with enabled=true are returned.
 */
const fs = require('fs');
const path = require('path');

function loadFeatures() {
  const dir = __dirname;
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const featureDir = path.join(dir, entry.name);
      const manifestPath = path.join(featureDir, 'feature.json');
      if (!fs.existsSync(manifestPath)) return null;

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!manifest.enabled) return null;

      const router = require(path.join(featureDir, 'routes.js'));
      return { ...manifest, router };
    })
    .filter(Boolean);
}

module.exports = { loadFeatures };
