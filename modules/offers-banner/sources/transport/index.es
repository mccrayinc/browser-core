import events from '../../core/events';
import utils from '../../core/utils';
import { copyToClipboard } from '../../core/clipboard';
import inject from '../../core/kord/inject';
import * as browserPanel from './browser-panel';
import * as rewardBox from './reward-box';

const core = inject.module('core');

export function send(data, type) {
  const mapper = {
    offers: payload => events.pub('offers-recv-ch', payload),
    telemetry: utils.telemetry,
  };
  const noop = () => {};
  (mapper[type] || noop)(data);
}

function commonTelemetry(msg, view = 'box') {
  if (!msg) { return; }
  const { target, action = 'click', vote, comments } = msg;
  const signal = { type: 'offrz', view, action, target };
  if (vote) { signal.vote = vote; }
  if (comments) { signal.comments = comments; }
  send(signal, 'telemetry');
}

export function dispatcher(type, offerId, msg = {}, autoTrigger) {
  const { handler, data, action } = msg;
  const isRewardBox = type === 'offers-cc';
  if (!(isRewardBox ? action : handler) || !data) { return; }

  const mapperBrowserPanel = {
    offersIFrameHandler: payload => browserPanel.actions(offerId, payload),
    sendTelemetry: payload => commonTelemetry(payload, 'bar'),
    offerShown: payload => browserPanel.offerShown(offerId, payload),
    offersFirstAppearance: payload => browserPanel.offersFirstAppearance(offerId, payload),
    copyToClipboard,
    openUrlHandler: ({ el_id: elId, url } = {}) => {
      browserPanel.specificTelemetry(elId);
      utils.openLink(window, url, true);
    },
  };

  const mapperRewardBox = {
    sendUserFeedback: payload => core.action('sendUserFeedback', { view: 'box', ...payload }),
    sendActionSignal: rewardBox.commonAction,
    getEmptyFrameAndData: rewardBox.hideTooltipIfShould,
    sendOfferActionSignal: rewardBox.actions,
    seenOffer: payload => rewardBox.seenOffer(offerId, payload, autoTrigger),
    sendTelemetry: payload => commonTelemetry(payload, 'box'),
    openURL: (payload) => {
      rewardBox.callToAction(payload);
      utils.openLink(window, payload.url, true);
    },
  };
  const noop = () => {};
  const mapper = isRewardBox ? mapperRewardBox : mapperBrowserPanel;
  const actionOrHandler = isRewardBox ? action : handler;
  (mapper[actionOrHandler] || noop)(data);
}