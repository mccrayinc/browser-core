/*!
 * Copyright (c) 2014-present Cliqz GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { tap, switchMap, takeUntil } from 'rxjs/operators';

import Enricher from '../operators/enricher';
import logger from '../logger';
import mixResults from '../mixers/mix-results';

import { getResultOrder } from '../operators/results/utils';
import finalize from '../operators/streams/finalize';

/*
 * Takes a query stream, creates a (mixed) result stream for each query.
 * Stop updating if user highlighted a result.
 */
export default function handleSessions(query$, highlight$, providers, config) {
  const enricher = new Enricher();

  // TODO: create session ID here
  const highlightWithLogger$ = highlight$.pipe(
    tap(() => logger.log('Highlight'))
  );
  let lastResult = {};

  const results$ = query$.pipe(
    tap(({ query }) => logger.log(`Query '${query}'`)),
    switchMap(
      ({ query, ...params }) => mixResults(
        {
          query,
          ...params,
          resultOrder: getResultOrder(lastResult),
        },
        providers,
        enricher,
        config,
      ).pipe(takeUntil(highlightWithLogger$)),
    ),
    finalize(config),
    tap((result) => {
      lastResult = result;
    }),
  );

  return results$;
}
