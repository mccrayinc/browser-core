/*!
 * Copyright (c) 2014-present Cliqz GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import background from '../core/base/background';
import { isCliqzBrowser } from '../core/platform';
import inject from '../core/kord/inject';
import prefs, { getCliqzPrefs } from '../core/prefs';
import console from '../core/console';
import config from '../core/config';
import { promiseHttpHandler } from '../core/http';
import pacemaker from '../core/services/pacemaker';
import { isDefaultBrowser } from '../platform/browser';
import { getDefaultSearchEngine, loadSearchEngines } from '../core/search-engines';

/* eslint-disable no-param-reassign */
const createTelemetry = (bg) => {
  let trkTimer = null;
  let telemetrySeq = -1;
  let telemetryReq = null;
  let telemetrySending = [];
  const TELEMETRY_MAX_SIZE = 500;

  function getNextSeq() {
    if (telemetrySeq === -1) {
      telemetrySeq = prefs.get('telemetrySeq', 0);
    }
    telemetrySeq = (telemetrySeq + 1) % 2147483647;
    return telemetrySeq;
  }

  function _pushTelemetryCallback(req) {
    try {
      const response = JSON.parse(req.response);

      if (response.new_session) {
        bg.sessionService.saveSession(response.new_session);
      }
      telemetrySending = [];
      telemetryReq = null;
    } catch (e) {
      // this can only happen if the callback is called
      // after the extension is turned off
    }
  }

  function _pushTelemetryError() {
    // pushTelemetry failed, put data back in queue to be sent again later
    console.log(`push telemetry failed: ${telemetrySending.length} elements`, 'pushTelemetry');
    bg.trk = telemetrySending.concat(bg.trk);

    // Remove some old entries if too many are stored,
    // to prevent unbounded growth when problems with network.
    const slicePos = (bg.trk.length - TELEMETRY_MAX_SIZE) + 100;
    if (slicePos > 0) {
      console.log(`discarding ${slicePos}old telemetry data`, 'pushTelemetry');
      bg.trk = bg.trk.slice(slicePos);
    }

    telemetrySending = [];
    telemetryReq = null;
  }

  function pushTelemetry() {
    prefs.set('telemetrySeq', telemetrySeq);
    if (telemetryReq) return;
    // put current data aside in case of failure
    telemetrySending = bg.trk.slice(0);
    bg.trk = [];

    console.log(`push telemetry data: ${telemetrySending.length} elements`, 'pushTelemetry');

    telemetryReq = promiseHttpHandler('POST', config.settings.STATISTICS, JSON.stringify(telemetrySending), 10000, true);
    telemetryReq.then(_pushTelemetryCallback);
    telemetryReq.catch(_pushTelemetryError);
  }

  return (msg, instantPush) => {
    console.log(msg, 'Utils.telemetry');

    bg.trk.push({
      session: bg.sessionService.getSession(),
      ts: Date.now(),
      seq: getNextSeq(),
      ...msg,
    });

    pacemaker.clearTimeout(trkTimer);
    trkTimer = null;

    if (instantPush || bg.trk.length % 100 === 0) {
      pushTelemetry();
    } else {
      trkTimer = pacemaker.setTimeout(pushTelemetry, 60000);
    }
  };
};
/* eslint-enable no-param-reassign */

export default background({
  requiresServices: ['cliqz-config', 'telemetry', 'session', 'pacemaker', 'host-settings'],
  telemetryService: inject.service('telemetry', ['installProvider', 'uninstallProvider', 'push', 'isBrowserTelemetryEnabled']),
  sessionService: inject.service('session', ['getSession', 'saveSession']),
  hostSettings: inject.service('host-settings', ['get']),

  init() {
    this.trk = [];

    // Instantiate legacy telemetry manager. It is stored in the closure only to
    // not be accessible from outside. Any user of telemetry should go through
    // telemetry service and not use providers directly.
    const telemetry = createTelemetry(this);

    this.telemetryProvider = {
      name: 'telemetry',
      send: (message, schema, instant) => {
        if (schema && schema.indexOf('.legacy.') === -1) {
          return Promise.resolve();
        }
        return telemetry(message, instant);
      },
    };
    this.telemetryService.installProvider(this.telemetryProvider);

    const sendEnvironmentalSignal = async ({ startup, instantPush }) => {
      //
      // Search engines are available in Cliqz browser only,
      // but not in standalone extensions
      //
      let defaultSearchEngineName = undefined; // eslint-disable-line no-undef-init
      if (isCliqzBrowser) {
        await loadSearchEngines();
        defaultSearchEngineName = (getDefaultSearchEngine() || {}).name;
      }
      const info = {
        type: 'environment',
        agent: navigator.userAgent,
        language: navigator.language,
        version: inject.app.version,
        startup,
        prefs: getCliqzPrefs(),
        defaultSearchEngine: defaultSearchEngineName,
        isDefaultBrowser: await isDefaultBrowser(),
        distribution: prefs.get('full_distribution', ''),
        version_host: await this.hostSettings.get('gecko.mstone', ''),
        version_dist: await this.hostSettings.get('distribution.version', ''),
        health_report_enabled: this.telemetryService.isBrowserTelemetryEnabled(),
      };

      // This signal is always sent as an "alive signal" and thus does not go
      // through telemetry service.
      telemetry(info, instantPush);
    };

    sendEnvironmentalSignal({ startup: true, instantPush: true });
    this.whoAmItimer = pacemaker.everyHour(
      sendEnvironmentalSignal.bind(null, { startup: false }),
    );
  },

  unload() {
    this.telemetryService.uninstallProvider(this.telemetryProvider);

    if (this.whoAmItimer !== null) {
      this.whoAmItimer.stop();
      this.whoAmItimer = null;
    }
  },

  events: {

  },

  actions: {
    getTrk() {
      return JSON.parse(JSON.stringify(this.trk));
    },
  },
});
