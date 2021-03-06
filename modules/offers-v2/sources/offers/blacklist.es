import Adblocker from '../../platform/lib/adblocker';
import ResourceLoader from '../../core/resource-loader';
import config from '../../core/config';
import prefs from '../../core/prefs';
import logger from '../common/offers_v2_logger';

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

export default class Blacklist {
  constructor() {
    this.engine = new Adblocker.FiltersEngine({ loadCosmeticFilters: false });
    const baseUrl = config.settings.CDN_BASEURL;
    const channel = prefs.get('offers.distribution.channel') || config.settings.OFFERS_CHANNEL || 'cliqz';
    this.loader = new ResourceLoader(
      ['offers-v2', 'rules.json.gz'],
      {
        cron: ONE_DAY,
        updateInterval: ONE_HOUR,
        dataType: 'json',
        remoteURL: `${baseUrl}/offers/display_rules/${channel}/rules.json.gz`
      }
    );
  }

  init() {
    this.loader.updateFromRemote({ force: true });
    this.loader
      .onUpdate(({ negation_rules: negationRules = [] } = {}) => {
        this.update({ filters: negationRules });
      });
    this.loader.load().catch(e => logger.warn(`Can't load blacklist rules: ${e}`));
  }

  unload() {
    this.engine = null;
    this.filters = null;
    this.loader.stop();
    this.loader = null;
  }

  update({ filters = [] }) {
    this.engine = Adblocker.FiltersEngine.parse(
      filters.join('\n'),
      { loadCosmeticFilters: false },
    );
  }

  has(url) {
    return this.engine.match(Adblocker.makeRequest({ url })).match;
  }
}
