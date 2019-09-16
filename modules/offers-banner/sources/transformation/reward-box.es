import { getResourceUrl, isCliqzBrowser, isWebExtension } from '../../core/platform';
import config from '../../core/config';
import { getMessage } from '../../core/i18n';
import prefs from '../../core/prefs';
import { getTitleColor, products } from '../utils';
import { calculateValidity } from './helpers';

function commonData() {
  return {
    products: products(),

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
  const backgroundColor = getTitleColor(templateData);
  const { logo_class: logoClass = 'normal' } = templateData;
  const expirationTime = expirationMs // Expect this to be always greater than Date.now();
    ? (createdTs + expirationMs) / 1000
    : templateData.validity;

  const [diff, diffUnit, isExpiredSoon] = calculateValidity(expirationTime);
  const validity = expirationTime && diff != null
    ? {
      text: `${getMessage('offers_expires_in')} ${diff} ${getMessage(diffUnit)}`,
      isExpiredSoon,
    } : {};

  return {
    created: createdTs,
    last_update: lastUpdateTs,
    relevant,
    state: offerState,
    template_name: templateName,
    template_data: templateData,
    offer_id: offerId,
    backgroundColor,
    logoClass,
    validity,
    notif_type: uiInfo.notif_type || 'tooltip',
    isCodeHidden,
    landing,
  };
}

function tooltip(uiInfo) {
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
  const backgroundColor = getTitleColor(templateData);

  if (notifType === 'tooltip_extra') {
    return {
      ...commonData(),
      showTooltip: true,
      logo: uiInfo.template_data.logo_dataurl,
      headline: headline || title,
      benefit,
      labels,
      backgroundColor,
      logoClass,
      backgroundImage: logoDataurl,
    };
  }

  return {
    ...commonData(),
    showTooltip: true,
    isGeneric: true,
    headline: getMessage('offers_hub_tooltip_new_offer'),
    icon: `${config.baseURL}offers-cc/images/offers-cc-icon-white.svg`,
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
      url: getResourceUrl('offers-cc/index.html?cross-origin'),
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
      tooltip: tooltip(uiInfo),
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
      url: getResourceUrl('offers-cc/index.html?cross-origin'),
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
  return notifType === 'pop-up'
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
    url: getResourceUrl('offers-cc/index.html?cross-origin'),
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
