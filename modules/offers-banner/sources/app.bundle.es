import events from '../core/events';
import runtime from '../platform/runtime';
import App from '../core/app';
import { newTab } from '../platform/tabs';
import { chrome, window } from '../platform/globals';
import telemetry from '../core/services/telemetry';
import config from '../core/config';
import prefs from '../core/prefs';
import Defer from '../core/helpers/defer';
import { ONBOARDING_URL, ONBOARDING_URL_DEBUG, OFFBOARDING_URL } from './common/constant';
import { guessDistributionChannel } from './attribution';

const CLIQZ = {};
const DEBUG = config.settings.channel === 'MO02';
const appCreated = new Defer();

(async () => {
  await prefs.init();
  if (!prefs.has('offers.distribution.channel')) {
    const channel = await guessDistributionChannel();
    prefs.set('offers.distribution.channel', channel.clean);
    prefs.set('offers.distribution.channel.ID', channel.ID);
    prefs.set('offers.distribution.channel.sub', channel.sub);
  }

  CLIQZ.app = new App({
    version: chrome.runtime.getManifest().version + prefs.get('offers.distribution.channel.ID', '')
  });

  CLIQZ.app
    .start()
    .then(() => {
      const session = encodeURIComponent(prefs.get('session'));
      const url = new URL(OFFBOARDING_URL);
      url.searchParams.append('session', session);
      chrome.runtime.setUninstallURL(url.href);
      runtime.onMessage.addListener((message) => {
        if (message.name === 'appReady') {
          return Promise.resolve({ ready: true });
        }

        return undefined;
      });
    });

  window.CLIQZ = CLIQZ;
  appCreated.resolve();
})();

function triggerOnboardingOffers() {
  const intentName = 'Segment.Onboarding';
  const durationSec = 60 * 60; // 1 hour
  CLIQZ.app.modules['offers-v2'].action('triggerOfferByIntent', intentName, durationSec);
}

async function onboarding(details) {
  if (details.reason === 'install' && config.settings.channel !== '99') {
    await appCreated.promise; // we must wait for the CLIQZ.app object to be created
    await CLIQZ.app.ready();
    const tabId = await newTab(DEBUG ? ONBOARDING_URL_DEBUG : ONBOARDING_URL, { focus: true });

    if (config.settings.SHOW_ONBOARDING_OVERLAY) {
      events.pub('lifecycle:onboarding', { tabId });
    }

    telemetry.push({
      type: 'activity',
      action: 'onboarding-show',
    });

    triggerOnboardingOffers();
  }
}

chrome.runtime.onInstalled.addListener(onboarding);

window.addEventListener('unload', () => {
  CLIQZ.app.stop();
  chrome.runtime.onInstalled.removeListener(onboarding);
});
