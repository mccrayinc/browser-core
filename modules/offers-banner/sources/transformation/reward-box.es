import {
  isCliqzBrowser,
  isWebExtension,
  isGhostery,
} from '../../core/platform';
import prefs from '../../core/prefs';
import { products, getResourceUrl } from '../utils';
import { calculateValidity } from './helpers';

function commonData() {
  const _products = products();
  const shouldShowOnboarding = (_products.chip || _products.myoffrz)
    && !prefs.get('myoffrz.seen_onboarding_notification', false);
  return {
    products: _products,
    shouldShowOptIn: isGhostery && !prefs.get('myoffrz.opted_in', null),
    shouldShowOnboarding,

    // the next two for browser-panel
    isCliqzBrowser,
    isWebExtension,
  };
}

function popup(uiInfo, {
  createdTs,
  offerId,
  lastUpdateTs,
  expirationMs,
  relevant,
  attrs: { state: offerState = 'new', isCodeHidden, landing },
}) {
  const { template_data: templateData = {}, template_name: templateName = {} } = uiInfo;
  const { logo_class: logoClass = 'normal' } = templateData;
  const expirationTime = expirationMs // Expect this to be always greater than Date.now();
    ? (createdTs + expirationMs) / 1000
    : templateData.validity;

  const { diff, diffUnit, expired = {} } = calculateValidity(expirationTime);
  const validity = expirationTime && diff !== undefined
    ? { diff, diffUnit, expired }
    : {};

  return {
    created: createdTs,
    last_update: lastUpdateTs,
    relevant,
    state: offerState,
    template_name: templateName,
    template_data: templateData,
    offer_id: offerId,
    logoClass,
    validity,
    notif_type: uiInfo.notif_type || 'tooltip',
    isCodeHidden,
    landing,
  };
}

function tooltip(offerId, uiInfo) {
  const {
    template_data: templateData,
    notif_type: notifType
  } = uiInfo || {};
  if (!templateData) { return [false, null]; }

  const {
    logo_class: logoClass = 'normal',
    logo_dataurl: logoDataurl,
    labels = [],
    benefit,
    headline,
    title,
  } = templateData;

  if (notifType === 'tooltip_extra') {
    return {
      ...commonData(),
      showTooltip: true,
      logo: uiInfo.template_data.logo_dataurl,
      headline: headline || title,
      benefit,
      labels,
      logoClass,
      backgroundImage: logoDataurl,
      offerId,
    };
  }

  return {
    ...commonData(),
    showTooltip: true,
    isGeneric: true,
    offerId,
  };
}

function popupWrapper(offerId, { uiInfo, expirationMs, createdTs, attrs }) {
  const offer = popup(uiInfo, {
    offerId,
    expirationMs,
    createdTs,
    attrs: { ...attrs, state: 'new' },
  });
  offer.preferred = true;
  const payload = {
    offerId,
    config: {
      url: getResourceUrl(),
      type: 'offers-cc',
      products: products(),
    },
    data: {
      ...commonData(),
      vouchers: [offer],
      showExpandButton: false,
      popupsImage: prefs.get('offers-popup.image', 'with-image'),
      popupsCopyCode: prefs.get('offers-popup.copy-code', 'current'),
    }
  };
  return [true, payload];
}

function tooltipWrapper(offerId, {
  uiInfo,
  expirationMs,
  createdTs,
  attrs,
}) {
  const payload = {
    data: {
      isPair: true,
      tooltip: tooltip(offerId, uiInfo),
      popup: {
        ...commonData(),
        vouchers: [popup(uiInfo, { offerId, expirationMs, createdTs, attrs })],
        showExpandButton: false,
        popupsImage: prefs.get('offers-popup.image', 'with-image'),
        popupsCopyCode: prefs.get('offers-popup.copy-code', 'current'),
      },
    },
    offerId,
    config: {
      url: getResourceUrl(),
      type: 'offers-cc',
      products: products(),
    },
  };
  return [true, payload];
}

export function transform(data = {}) {
  const {
    createdTs,
    offer_data: { ui_info: uiInfo, expirationMs } = {},
    offer_id: offerId,
    attrs,
  } = data;

  const { notif_type: notifType } = uiInfo;
  return notifType === 'pop-up' || (isGhostery && notifType === undefined)
    ? popupWrapper(offerId, { uiInfo, expirationMs, createdTs, attrs })
    : tooltipWrapper(offerId, { uiInfo, expirationMs, createdTs, attrs });
}

export function transformMany({ offers = [] } = {}) {
  const newOffers = offers.map((elem) => {
    const {
      last_update_ts: lastUpdateTs,
      created_ts: createdTs,
      relevant,
      attrs,
      offer_id: offerId,
      offer_info: offerInfo = {}
    } = elem || {};
    const { ui_info: uiInfo, expirationMs } = offerInfo;
    if (!offerId || !uiInfo) { return null; }
    return popup(uiInfo, {
      createdTs,
      offerId,
      lastUpdateTs,
      relevant,
      expirationMs,
      attrs,
    });
  }).filter(Boolean);

  newOffers.sort((a, b) => (b.relevant - a.relevant || b.last_update - a.last_update));
  const offersConfig = {
    url: getResourceUrl(),
    type: 'offers-cc',
    products: products(),
  };

  return {
    config: offersConfig,
    data: {
      ...commonData(),
      vouchers: newOffers,
      noVoucher: newOffers.length === 0,
      showExpandButton: false,
      popupsImage: prefs.get('offers-popup.image', 'with-image'),
      popupsCopyCode: prefs.get('offers-popup.copy-code', 'current'),
    }
  };
}
