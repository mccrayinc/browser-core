/*!
 * Copyright (c) 2014-present Cliqz GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/* global $, Handlebars */
/* eslint-disable no-console */
import QRCode from 'qrcodejs';
import templates from '../templates';

const images = {
  pairing_status_disconnected: './images/pairing-status-disconnected.png',
  pairing_status_active: './images/pairing-status-active.png',
  cliqz_icon: './images/cliqz-icon.png',
};

export default class PairingUI {
  init(window, PeerComm) {
    this.i18n = window.chrome.i18n.getMessage.bind(window.chrome.i18n);
    this.document = window.document;
    this.window = window;
    this.PeerComm = PeerComm;

    this.TEMPLATE_NAMES = ['template'];
    this.TEMPLATE_CACHE = {};

    // Pairing events
    this.oninit = (info) => {
      console.log('PairingUI: oninit');
      this.renderInitial();
      if (info.isPaired) {
        this.renderPaired(info);
      } else if (info.isPairing) {
        this.onpairing(info);
      } else {
        this.onunpaired(info);
      }
    };
    this.ondeviceadded = this.renderPaired.bind(this);
    this.onpairing = this.renderPairing.bind(this);
    this.onpaired = this.renderPaired.bind(this);
    this.onunpaired = ({ isUnpaired }) => {
      this.renderUnpaired();
      if (isUnpaired) {
        console.log('PairingUI: onunpaired -> startPairing...');
        this.startPairing();
      }
    };
    this.onmasterconnected = this.renderPaired.bind(this);
    this.onmasterdisconnected = this.renderPaired.bind(this);

    Handlebars.partials = templates;
    this.PeerComm.getInfo().then((info) => {
      if (info.isInit) {
        this.oninit(info);
      }
    }).catch((e) => {
      console.error(e);
    }).then(() => {
      this.start();
    });

    this.connectionChecker = setInterval(() => {
      console.log('PairingUI: connectionChecker -> startPairing...');
      this.startPairing();
      PeerComm.checkMasterConnection().catch((e) => {
        console.error('PairingUI error:', e);
      });
    }, PairingUI.checkInterval);
  }

  async startPairing() {
    try {
      const info = await this.PeerComm.startPairing();
      console.log('PeerComm.startPairing returned:', info);
      this.onpairing(info);
    } catch (e) {
      console.error('PairingUI: startPairing failed:', e);
    }
  }

  updatePairingStatus(status) {
    $('#page-container').attr('data-state', status);
  }

  updateConnectionInfo(isMasterConnected, deviceName, masterName) {
    $('#device-name').text(deviceName);
    $('#master-name').text(masterName);
    this.updatePairingStatus('paired');

    if (isMasterConnected) {
      $('#connection-status-img').attr('src', images.pairing_status_active);
      $('#connection-status-text').attr('class', 'connected');
      $('#connection-status-text').text(this.i18n('pairing_online'));
      $('#on-disconnected-tip').css('display', 'none');
    } else {
      $('#connection-status-img').attr('src', images.pairing_status_disconnected);
      $('#connection-status-text').attr('class', 'disconnected');
      $('#connection-status-text').text(this.i18n('pairing_offline'));
      $('#on-disconnected-tip').css('display', 'block');
    }
  }

  renderPairing({ pairingToken }) {
    const token = pairingToken;
    if (token) {
      if (!this.qr) {
        this.qr = new QRCode($('#qrcode')[0], {
          text: token,
          width: 256,
          height: 256,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.Q,
        });
        $(`<img src="${images.cliqz_icon}" class="icon-logo" alt=""/>`).insertAfter('#qrcode > canvas');
      } else {
        this.qr.makeCode(token);
      }
    }
  }

  renderPaired({ isPaired, masterName, deviceName, isMasterConnected }) {
    if (!isPaired) return;

    try {
      const iframe = parent.document.querySelector('iframe#connect-iframe');
      iframe.classList.add('hidden');
    } catch (e) {
      // Permission denied to access property "document", due to browser scope
    }

    this.updateConnectionInfo(isMasterConnected, deviceName, masterName);
  }

  renderUnpaired() {
    if (this.qr) {
      this.qr.clear();
      delete this.qr;
      $('#qrcode').empty();
    }
    this.updatePairingStatus('unpaired');
  }

  renderInitial() {
    const window = this.window;

    const deviceName = $('#browser-name').val()
      || `Cliqz Browser on ${window.navigator.platform}`;

    const data = {
      deviceName,
    };

    data.i18n = {
      title: this.i18n('pairing_title'),
      connectInProgressHeader: this.i18n('connect_in_progress_header'),
      connectInProgressMessage: this.i18n('connect_in_progress_message'),
      instructionsTitle: this.i18n('pairing_instructions_title'),
      instructionsAndroid: this.i18n('pairing_instructions_playstore'),

      videoDownloaderTitle: this.i18n('pairing_video_title'),
      receiveTabTitle: this.i18n('pairing_receive_tab_title'),
      sendTabTitle: this.i18n('pairing_send_tab_title'),

      connectedTitle: this.i18n('pairing_status_title'),
      pairingBrowserPairWith: this.i18n('pairing_browser_pair_with'),
      onDisconnectedTip: this.i18n('pairing_on_disconnected_tip'),
      contactSupport: this.i18n('pairing_contact_support'),
      contactLearnMore: this.i18n('pairing_contact_learn_more'),

      pairingScanTitle: this.i18n('pairing_scan_title'),
      pairingAllFeatures: this.i18n('pairing_all_features_title'),
      pairingEnabledFeatures: this.i18n('pairing_enabled_features_title'),

      unpair: this.i18n('pairing_unpair'),
    };

    $('#content').html(templates.main(data));

    $('#unpair-button').click(() => {
      console.log('unpair clicked');
      this.PeerComm.unpair();
    });

    this.updatePairingStatus('unpaired');
  }

  unload() {
    clearInterval(this.connectionChecker);
  }

  start() {
    this.startPairing();
  }

  get observerID() {
    if (!this._observerID) {
      this._observerID = `__PAIRING__DASHBOARD__${Math.random()}`;
    }
    return this._observerID;
  }

  static get checkInterval() {
    return 5000;
  }
}
