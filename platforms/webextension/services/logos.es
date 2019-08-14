import prefs from '../../core/prefs';
import config from '../../core/config';
import { subscribe } from '../../core/events';
import ResourceLoader from '../../core/resource-loader';

function getBrandsDBUrl(version) {
  return `${config.settings.BACKGROUND_IMAGE_URL}${version}/data/database.json`;
}

export default function (BRANDS_DATABASE_VERSION, { updateVersion, updateDatabase }) {
  const versionOverride = prefs.get('config_logoVersion');
  const dev = prefs.get('brands-database-version');
  let version = BRANDS_DATABASE_VERSION; // default fallback value

  if (dev) {
    version = dev;
  } else if (versionOverride) {
    version = versionOverride;
  }

  // use the proper database version for generating logo paths
  updateVersion(version);

  // This resource loader does not update periodically
  const loader = new ResourceLoader(
    ['core', 'logo-database.json']
  );

  subscribe('cliqz-config:update', () => {
    const newVersion = prefs.get('config_logoVersion', version);
    if (newVersion === version) {
      return;
    }

    const newRemoteURL = getBrandsDBUrl(newVersion);

    // prepare remote update
    loader.resource.remoteURL = newRemoteURL;

    loader.updateFromRemote({ force: true }).then((db) => {
      // empty update means failure
      if (!db) {
        return;
      }
      version = newVersion;
      updateVersion(newVersion);

      // prevent periodic updates
      loader.resource.remoteURL = null;

      updateDatabase(db);
    });
  });

  return loader.load();
}
