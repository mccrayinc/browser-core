/*!
 * Copyright (c) 2014-present Cliqz GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/* global chai */

const configSignals = {
  sessionExpiryEnabled: false,
  nonTrackerEnabled: false,
  cookieMode: 'thirdparty',
  cookieBehavior: 5,
  trackerLocalStorageEnabled: false,
};

require('../../../anolysis/unit/telemetry-schemas-test-helpers')({
  name: 'cookie-monster-performance',
  metrics: [
    'cookie-monster.cookieBatch',
    'cookie-monster.prune',
    'cookie-monster.config',
  ],
  schemas: [
    'cookie-monster/telemetry/metrics',
    'cookie-monster/telemetry/analyses',
  ],
  tests: (generateAnalysisResults) => {
    it('aggregates batch signals', async () => {
      const signals = await generateAnalysisResults({
        'cookie-monster.cookieBatch': [{
          count: 5,
          existing: 2,
          visited: 1,
          deleted: 1,
          modified: 4,
          expired: 1,
        }, {
          count: 10,
          existing: 2,
          visited: 0,
          deleted: 3,
          modified: 5,
          expired: 2,
        }],
        'cookie-monster.config': [configSignals],
      });
      chai.expect(signals).to.have.length(1);
      chai.expect(signals[0]).to.eql({
        moduleActive: true,
        batches: 2,
        prunes: 0,
        medBatchSize: 7.5,
        maxBatchSize: 10,
        meanExisting: 2,
        meanVisited: 0.5,
        deleted: 4,
        modified: 9,
        expired: 3,
        localStorageDeleted: 0,
        ...configSignals
      });
    });

    it('aggregates prune signals', async () => {
      const signals = await generateAnalysisResults({
        'cookie-monster.prune': [{
          visitsPruned: 23,
          cookiesPruned: 342,
          visitsCount: 3,
          cookiesCount: 241,
          sessionsPruned: 2,
          totalCookies: 20,
          totalOrigins: 6,
        }, {
          visitsPruned: 3,
          cookiesPruned: 42,
          visitsCount: 33,
          cookiesCount: 120,
          sessionsPruned: 1,
          totalCookies: 25,
          totalOrigins: 5,
        }],
        'cookie-monster.config': [configSignals],
      });
      chai.expect(signals).to.have.length(1);
      chai.expect(signals[0]).to.eql({
        moduleActive: true,
        batches: 0,
        prunes: 2,
        cookiesSize: 241,
        visitsSize: 33,
        visitsPruned: 26,
        cookiesPruned: 384,
        sessionsPruned: 3,
        totalCookies: 25,
        totalOrigins: 6,
        ...configSignals,
      });
    });

    it('aggregates combined signals', async () => {
      const signals = await generateAnalysisResults({
        'cookie-monster.config': [configSignals],
        'cookie-monster.cookieBatch': [{
          count: 5,
          existing: 2,
          visited: 1,
          deleted: 1,
          modified: 4,
          expired: 1,
        }],
        'cookie-monster.prune': [{
          visitsPruned: 23,
          cookiesPruned: 342,
          visitsCount: 3,
          cookiesCount: 241,
          sessionsPruned: 0,
          totalCookies: 25,
          totalOrigins: 5,
        }],
      });
      chai.expect(signals).to.have.length(1);
      chai.expect(signals[0]).to.eql({
        moduleActive: true,
        batches: 1,
        prunes: 1,
        medBatchSize: 5,
        maxBatchSize: 5,
        meanExisting: 2,
        meanVisited: 1,
        deleted: 1,
        modified: 4,
        expired: 1,
        cookiesSize: 241,
        visitsSize: 3,
        visitsPruned: 23,
        cookiesPruned: 342,
        localStorageDeleted: 0,
        sessionsPruned: 0,
        totalCookies: 25,
        totalOrigins: 5,
        ...configSignals,
      });
    });
  },
});
