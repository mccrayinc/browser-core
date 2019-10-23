/*!
 * Copyright (c) 2014-present Cliqz GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/* global ChromeUtils, EventManager,
   addMessageListener, sendAsyncMessage,  windowTracker, tabTracker */
import Defer from '../../../core/helpers/defer';
import { nextTick } from '../../../core/decorators';
import BrowserDropdownManager from '../../../dropdown/managers/browser';
import { PASSIVE_LISTENER_OPTIONS } from '../../../dropdown/managers/utils';
import LastQuery from './last-query';

const { E10SUtils } = ChromeUtils.import('resource://gre/modules/E10SUtils.jsm');
const { ExtensionParent } = ChromeUtils.import('resource://gre/modules/ExtensionParent.jsm');
const { EventEmitter } = ChromeUtils.import('resource://gre/modules/EventEmitter.jsm');
const { Services } = ChromeUtils.import('resource://gre/modules/Services.jsm');
const { ExtensionUtils } = ChromeUtils.import('resource://gre/modules/ExtensionUtils.jsm');
const { promiseEvent, ExtensionError } = ExtensionUtils;

const STYLESHEET_URL = `modules/dropdown/styles/xul.css?${Date.now()}`;
const DROPDOWN_URL = '/modules/dropdown/dropdown.html';
const AC_PROVIDER_NAME = 'cliqz-results';

function addStylesheet(document, url) {
  const stylesheet = document.createElementNS('http://www.w3.org/1999/xhtml', 'h:link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = url;
  stylesheet.type = 'text/css';
  stylesheet.style.display = 'none';
  stylesheet.classList.add('cliqz-theme');

  document.documentElement.appendChild(stylesheet);
}

function removeStylesheet(document, url) {
  const styles = [].slice.call(document.getElementsByClassName('cliqz-theme'));
  styles.filter(style => style.href === url)
    .forEach((stylesheet) => {
      if (!stylesheet.parentNode) {
        return;
      }

      stylesheet.parentNode.removeChild(stylesheet);
    });
}

const frameScript = () => {
  const incomingMessages = new Set();
  let messageId = 1;

  addMessageListener('Dropdown:MessageIn', {
    receiveMessage({ data }) {
      messageId += 1;
      data.messageId = messageId; // eslint-disable-line
      incomingMessages.add(data.messageId);
      content.window.postMessage(data, '*'); // eslint-disable-line
    },
  });

  // eslint-disable-next-line no-undef
  addEventListener('message', (ev) => {
    const message = ev.data;
    try {
      if (incomingMessages.delete(message.messageId)) {
        // ignore own messages
        return;
      }
    } catch (e) {
      //
    }

    delete message.messageId;

    sendAsyncMessage('Dropdown:MessageOut', message);
  }, true, true);
};

function createUrlbarControllerProxy(controller, expansion) {
  return new Proxy(controller, {
    get(obj, prop) {
      if (expansion[prop]) {
        return expansion[prop];
      }
      return obj[prop];
    }
  });
}

export default class Dropdown extends EventEmitter {
  _oldPlaceholder = null;

  constructor(extension) {
    super();
    const { remote, principal, groupFrameLoader } = extension;
    this._extension = extension;
    this._remote = remote || false;
    this._principal = principal || Services.scriptSecurityManager.createNullPrincipal({});
    this._groupFrameLoader = groupFrameLoader || null;
    this._overriden = null;
    this._windows = new Map();
    this._onThemeChange();
  }

  get overriden() {
    return this._overriden;
  }

  get _currentWindow() {
    return windowTracker.getCurrentWindow();
  }

  get _stylesheetURL() {
    return this._resolveURL(STYLESHEET_URL);
  }

  _getWindowId(window) {
    return windowTracker.getId(window);
  }

  _resolveURL(url) {
    return this._extension.baseURI.resolve(url);
  }

  getWindowByTabId(tabId) {
    if (!tabId) {
      return this._currentWindow();
    }

    const tab = tabTracker.getTab(tabId);
    if (!tab) {
      throw new ExtensionError(`Cannot find tab with ID ${tabId}`);
    }
    return tab.ownerGlobal;
  }

  _getDropdown(windowId /* or window */) {
    let w = null;
    if (typeof windowId === 'number') {
      w = windowTracker.getWindow(windowId, null);
    } else if (windowId === null) {
      w = this._currentWindow;
    } else {
      w = windowId;
    }
    return this._windows.get(w);
  }

  _getMaxHeight(windowId) {
    const w = windowId === null ? this._currentWindow : windowTracker.getWindow(windowId, null);
    const dropdown = this._windows.get(w);
    if (dropdown && dropdown.maxHeight !== undefined) {
      return dropdown.maxHeight;
    }
    return w.innerHeight - 140;
  }

  override(context, { placeholder } = {}) {
    if (context.viewType !== 'background') {
      throw new ExtensionError('Dropdown override only allowed in the background context');
    }

    const url = this._resolveURL(DROPDOWN_URL);
    if (this._overriden) {
      throw new ExtensionError('Dropdown is already overriden');
    }

    if (placeholder) {
      this._placeholder = placeholder;
    }

    const readyPromises = [];
    this._url = url;
    this._themePref = Services.prefs.getBranch('lightweightThemes.selectedThemeID');
    this._themePref.addObserver('', this);
    windowTracker.addOpenListener(this.onWindowOpened);
    windowTracker.addCloseListener(this.onWindowClosed);
    for (const window of windowTracker.browserWindows()) {
      readyPromises.push(this.onWindowOpened(window));
    }
    this._overriden = Promise.all(readyPromises);
    return this._overriden;
  }

  get DEFAULT_STATE() {
    return {
      overriden: this.overriden !== null,
      height: 0,
      opened: false,
    };
  }

  getState(window) {
    const dropdown = this._getDropdown(window);
    if (!dropdown || !dropdown.state) {
      return this.DEFAULT_STATE;
    }
    return dropdown.state;
  }

  setState(window, state) {
    const dropdown = (typeof window === 'number' || window === null) ? this._getDropdown(window) : this._windows.get(window);
    if (dropdown) {
      Object.assign(dropdown.state, state);
    }
  }

  restore(context) {
    if (context.viewType !== 'background') {
      throw ExtensionError('Dropdown override only allowed in the background context');
    }

    if (!this._overriden) {
      throw new ExtensionError('Dropdown is not overriden');
    }
    this.close();
  }

  close() {
    this._themePref.removeObserver('', this);
    windowTracker.removeCloseListener(this.onWindowClosed);
    windowTracker.removeOpenListener(this.onWindowOpened);
    for (const [window] of this._windows) {
      this.onWindowClosed(window);
    }
    this._url = null;
    this._overriden = null;
    this._windows.clear();
  }

  onWindowOpened = (window) => {
    const dropdown = this._replaceDropdown(window);
    if (dropdown) {
      this._windows.set(window, dropdown);
      return dropdown.isReady;
    }
    return Promise.resolve();
  }

  onWindowClosed = (window) => {
    const dropdown = this._windows.get(window);
    if (!dropdown) {
      return;
    }
    this._revertDropdown(dropdown);
    this._windows.delete(window);
  }

  updateMaxHeight(window) {
    const dropdown = this._windows.get(window);
    if (dropdown) {
      dropdown.maxHeight = window.innerHeight - 140;
    }
  }

  _unregisterQuantumBarProviders(window) {
    const { controller } = window.gURLBar;
    const providers = controller.manager.providers.concat();
    providers.forEach(p => controller.manager.unregisterProvider(p));
    return providers;
  }

  _reregisterQuantumBarProviders(window, providers) {
    const { controller } = window.gURLBar;
    providers.forEach(p => controller.manager.registerProvider(p));
  }

  _overrideDefaultAutocomplete(window) {
    const windowId = this._getWindowId(window);
    const document = window.document;
    const urlbar = window.gURLBar.textbox || window.gURLBar;
    const controller = window.gURLBar.controller;
    let qbProviders = null;
    let qbController = null;

    if (controller && controller.manager) {
      qbProviders = this._unregisterQuantumBarProviders(window);
      qbController = controller;
      // eslint-disable-next-line no-param-reassign
      window.gURLBar.controller = createUrlbarControllerProxy(controller, {
        handleKeyNavigation: () => {}
      });

      // For compatibility with Firefox 68-69 (which have both legacy and quantumbar),
      // switching to legacy urlbar.
      if (urlbar.getAttribute('quantumbar') === 'true') {
        urlbar.setAttribute('quantumbar', 'false');
      }
    }

    const autocompletesearch = urlbar.getAttribute('autocompletesearch');
    urlbar.setAttribute('autocompletesearch', AC_PROVIDER_NAME);
    urlbar.setAttribute('pastetimeout', 0);
    urlbar.style.maxWidth = '100%';
    urlbar.style.margin = '0px 0px';

    // create BrowserDropdownManager and LastQuery
    const { startupReason } = this._extension;
    const lastQuery = new LastQuery(window);
    const dropdownManager = new BrowserDropdownManager({
      window,
      windowId,
      lastQuery,
      startupReason
    }, this);

    // create a new panel for cliqz to avoid inconsistencies at FF startup
    const popup = document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'panel');
    // mock default FF function
    popup.enableOneOffSearches = () => {};
    popup.closePopup = () => dropdownManager.close();
    popup.richlistbox = {
      children: []
    };
    popup.oneOffSearchButtons = {
      maybeRecordTelemetry() { return false; }
    };
    popup.openAutocompletePopup = () => {};
    popup.setAttribute('id', 'PopupAutoCompleteRichResultCliqz');
    document.getElementById('mainPopupSet').appendChild(popup);

    const autocompletepopup = urlbar.getAttribute('autocompletepopup');
    urlbar.setAttribute('autocompletepopup', 'PopupAutoCompleteRichResultCliqz');

    const disableKeyNavigation = urlbar.disableKeyNavigation;
    urlbar.disableKeyNavigation = true;

    // make CMD/CTRL + K equal with CMD/CTRL + L
    const searchShortcutElements = document.getElementById('mainKeyset').querySelectorAll('#key_search, #key_search2');
    [].forEach.call(searchShortcutElements, (item) => {
      item.setAttribute('original_command', item.getAttribute('command'));
      item.setAttribute('command', 'Browser:OpenLocation');
    });

    return {
      urlbar,
      popup,
      lastQuery,
      dropdownManager,
      autocompletesearch,
      autocompletepopup,
      disableKeyNavigation,
      searchShortcutElements,
      qbProviders,
      qbController,
    };
  }

  _restoreDefaultAutocomplete({
    urlbar,
    popup,
    lastQuery,
    dropdownManager,
    autocompletesearch,
    autocompletepopup,
    disableKeyNavigation,
    searchShortcutElements,
    qbProviders,
    qbController,
  }) {
    [].forEach.call(searchShortcutElements, (item) => {
      item.setAttribute('command', item.getAttribute('original_command'));
    });

    /* eslint-disable no-param-reassign */
    urlbar.disableKeyNavigation = disableKeyNavigation;
    urlbar.setAttribute('autocompletesearch', autocompletesearch);
    urlbar.setAttribute('autocompletepopup', autocompletepopup);
    urlbar.style.maxWidth = '';
    urlbar.style.margin = '';

    if (popup && popup.parentNode) {
      popup.parentNode.removeChild(popup);
    }

    lastQuery.unload();
    dropdownManager.unload();

    if (qbProviders) {
      this._reregisterQuantumBarProviders(urlbar.ownerGlobal, qbProviders);
      urlbar.ownerGlobal.gURLBar.controller = qbController;
    }
    /* eslint-enable no-param-reassign */
  }

  _createToolbarAndBrowser(document) {
    const readyDefer = new Defer();
    const browser = document.createXULElement
      ? document.createXULElement('browser')
      : document.createElement('browser');
    browser.setAttribute('type', 'content');
    browser.setAttribute('id', 'cliqz-popup');
    browser.setAttribute('disableglobalhistory', 'true');
    browser.setAttribute('transparent', 'true');
    browser.setAttribute('class', 'webextension-popup-browser');
    browser.setAttribute('webextension-view-type', 'popup');
    browser.setAttribute('tooltip', 'aHTMLTooltip');
    browser.setAttribute('contextmenu', 'contentAreaContextMenu');
    browser.setAttribute('autocompletepopup', 'PopupAutoComplete');
    browser.setAttribute('selectmenulist', 'ContentSelectDropdown');
    browser.setAttribute('selectmenuconstrained', 'false');
    browser.setAttribute('ignorekeys', 'false');
    browser.setAttribute('flex', '1');
    browser.style.MozUserFocus = 'ignore';
    browser.tabIndex = -1;

    // Ensure that the browser is going to run in the same process of the other
    // extension pages from the same addon.
    browser.sameProcessAsFrameLoader = this._groupFrameLoader;

    if (this._remote) {
      browser.setAttribute('remote', 'true');
      browser.setAttribute('remoteType', E10SUtils.EXTENSION_REMOTE_TYPE);
      browser.setAttribute('renderroot', 'content');
    }

    let readyPromise;
    if (this._remote) {
      readyPromise = promiseEvent(browser, 'XULFrameLoaderCreated');
    } else {
      readyPromise = promiseEvent(browser, 'load');
    }

    readyPromise.then(() => {
      const script = `data:text/javascript,(${encodeURI(frameScript)}).call(this)`;
      browser.messageManager.loadFrameScript(script, true, true);
      browser.messageManager.addMessageListener('Dropdown:MessageOut', this);
      readyDefer.resolve();
    });

    const parentElement = document.getElementById('navigator-toolbox');
    const navToolbar = document.getElementById('nav-bar');
    const container = document.createElement('div');
    container.appendChild(browser);

    const cliqzToolbar = document.createElement('toolbar');
    cliqzToolbar.setAttribute('fullscreentoolbar', 'true');
    cliqzToolbar.id = 'cliqz-toolbar';
    // Default height of `toolbar` and `browser` elements should be set to 0,
    // otherwise they will be visible during extension init/update (see EX-9266)
    cliqzToolbar.style.display = 'block';
    browser.style.display = 'block';
    cliqzToolbar.style.height = 0;
    cliqzToolbar.style.minHeight = 0;
    cliqzToolbar.style.padding = 0;
    cliqzToolbar.appendChild(container);
    parentElement.insertBefore(cliqzToolbar, navToolbar.nextSibling);

    // Create a new stacking context around browser element (it has z-index 100000)
    // so nav-bar element gets higher above on z-axis.
    cliqzToolbar.style.position = 'relative';
    cliqzToolbar.style.zIndex = 2;
    navToolbar.style.zIndex = 3;

    ExtensionParent.apiManager.emit('extension-browser-inserted', browser);
    try {
      browser.loadURI(this._url, { triggeringPrincipal: this._principal });
    } catch (e) {
      browser.loadURI(this._url);
    }

    return {
      browser,
      isReady: readyDefer.promise,
      cliqzToolbar,
    };
  }

  _destroyToolbarAndBrowser({ window, browser, cliqzToolbar }) {
    browser.messageManager.removeMessageListener('Dropdown:MessageOut', this);

    const navToolbar = window.document.getElementById('nav-bar');
    navToolbar.setAttribute('overflowable', 'true');
    navToolbar.style.zIndex = 'auto';

    cliqzToolbar.parentNode.removeChild(cliqzToolbar);
  }

  _replaceDropdown(window) {
    let initialized = false;

    // do not initialize the UI if locationbar is invisible in this window
    if (!window.locationbar.visible) return null;

    addStylesheet(window.document, this._stylesheetURL);

    const windowId = this._getWindowId(window);
    // replace default firefox autocomplete service with an empty stub
    const {
      urlbar,
      popup,
      lastQuery,
      dropdownManager,
      autocompletesearch,
      autocompletepopup,
      disableKeyNavigation,
      searchShortcutElements,
      qbProviders,
      qbController,
    } = this._overrideDefaultAutocomplete(window);

    // create a browser
    const { browser, isReady, cliqzToolbar } = this._createToolbarAndBrowser(window.document);

    // Reload urlbar to apply changes done to it
    this._reloadUrlbar(urlbar);
    dropdownManager.init();
    dropdownManager.createIframeWrapper();

    // update placeholder
    this._setURLBarPlaceholder(urlbar, this._placeholder);

    window.addEventListener('resize', this, PASSIVE_LISTENER_OPTIONS);
    window.gNavToolbox.addEventListener('customizationstarting', this);

    initialized = true;

    return {
      windowId,
      window,
      urlbar,
      lastQuery,
      dropdownManager,
      popup,
      autocompletesearch,
      autocompletepopup,
      disableKeyNavigation,
      initialized,
      searchShortcutElements,
      qbProviders,
      qbController,
      cliqzToolbar,
      browser,
      isReady,
      urlbarAttributes: this._calculateURLBarAttributes(window),
      state: this.DEFAULT_STATE
    };
  }

  _revertDropdown(dropdown) {
    const {
      window,
      urlbar,
      initialized,
    } = dropdown;

    if (!initialized) return;

    window.gNavToolbox.removeEventListener('customizationstarting', this);
    window.removeEventListener('resize', this, PASSIVE_LISTENER_OPTIONS);

    if (this._oldPlaceholder !== null) {
      const inputField = urlbar.ownerGlobal.gURLBar.inputField;
      inputField.placeholder = this._oldPlaceholder;
    }
    this._destroyToolbarAndBrowser(dropdown);
    this._restoreDefaultAutocomplete(dropdown);
    this._reloadUrlbar(urlbar);
    removeStylesheet(window.document, this._stylesheetURL);
  }

  _reloadUrlbar(urlbar) {
    const el = urlbar;
    const oldVal = el.value;

    if (el && el.parentNode) {
      el.blur();
      el.parentNode.insertBefore(el, el.nextSibling);
      el.value = oldVal;
    }
    // We should keep current cursor position in case user already
    // started typed somehting by this moment (see EX-4940)
    /* eslint-disable no-param-reassign */
    const { selectionStart, selectionEnd } = urlbar;
    urlbar.focus();
    urlbar.selectionStart = selectionStart;
    urlbar.selectionEnd = selectionEnd;
    /* eslint-enable no-param-reassign */
  }

  _onThemeChange() {
    nextTick(() => {
      const window = windowTracker.getCurrentWindow();
      const CHANNEL_TRESHOLD = 220;
      const toolbar = window.document.getElementById('nav-bar');
      const bgColor = window.getComputedStyle(toolbar)['background-color'];

      // Check if toolbar background color is light-grey-ish and non-transparent
      const [, r, g, b, a] = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+))?/) || ['', '0', '0', '0', '0'];
      if (r > CHANNEL_TRESHOLD
          && g > CHANNEL_TRESHOLD
          && b > CHANNEL_TRESHOLD
          && (a === undefined || a >= 1)
      ) {
        this._color = bgColor;
      } else {
        this._color = null;
      }
    });
  }

  _setURLBarPlaceholder(urlbar, placeholder) {
    if (!placeholder) {
      return;
    }
    const inputField = urlbar.ownerGlobal.gURLBar.inputField;

    if (this._oldPlaceholder === null) {
      this._oldPlaceholder = inputField.placeholder;
    }
    inputField.placeholder = placeholder;
  }

  getURLBarAttributes(window) {
    const dropdown = this._getDropdown(window);
    if (dropdown) {
      return dropdown.urlbarAttributes;
    }
    return this._calculateURLBarAttributes(window);
  }

  _calculateURLBarAttributes(window) {
    const urlbar = window.gURLBar.textbox || window.gURLBar;

    const urlbarRect = urlbar.getBoundingClientRect();
    const urlbarLeftPos = Math.round(urlbarRect.left || urlbarRect.x || 0);
    const urlbarWidth = urlbarRect.width;
    const extraPadding = 10;
    let contentPadding = extraPadding + urlbarLeftPos;

    // Reset padding when there is a big space on the left of the urlbar
    // or when the browser's window is too narrow
    if (contentPadding > 500 || window.innerWidth < 650) {
      contentPadding = 50;
    }

    return {
      padding: contentPadding,
      left: urlbarLeftPos,
      width: urlbarWidth,
      navbarColor: this._color,
    };
  }

  _updateURLBarAttributes(window) {
    const dropdown = this._getDropdown(window);
    if (!dropdown) {
      return;
    }
    dropdown.urlbarAttributes = this._calculateURLBarAttributes(window);
  }

  observe(subject, topic, data) {
    if (topic === 'nsPref:changed') {
      this._onThemeChange(subject, topic, data);
    }
  }

  handleEvent(event) {
    const window = event.target.ownerGlobal;
    switch (event.type) {
      case 'resize':
        // Update dropdown dimensions on resize
        this._updateURLBarAttributes(window);
        break;
      case 'customizationstarting':
        // EX-9303: During browser customization a new `gURLBar` will be created.
        // Destroy exising dropdown override on `customizationstarting`...
        window.gNavToolbox.addEventListener('customizationending', this, { once: true });
        this.onWindowClosed(window);
        break;
      case 'customizationending':
        // ... and create a new one on `customizationending`.
        this.onWindowOpened(window);
        break;
      default:
        // This handler cannot be called for any events other than those we subscribed to
    }
  }

  async sendMessage(windowId, payload) {
    await this._overriden;
    const { browser } = this._getDropdown(windowId);
    browser.messageManager.sendAsyncMessage('Dropdown:MessageIn', payload);
  }

  setHeight(windowId, height) {
    const { browser, window } = this._getDropdown(windowId);
    const newHeight = Math.min(this._getMaxHeight(windowId), height);
    this.setState(windowId, {
      height: newHeight,
      opened: newHeight !== 0,
    });
    const heightInPx = `${newHeight}px`;
    browser.style.height = heightInPx;

    const navToolbar = window.document.getElementById('nav-bar');
    // If newHeight equals 0 then we remove attribute overflowable which results in showing a
    // shadow line under search url bar.
    // Otherwise we need to set this attribute back to nav-bar.
    if (newHeight === 0) {
      navToolbar.setAttribute('overflowable', 'true');
    } else {
      navToolbar.removeAttribute('overflowable');
    }
  }

  getCurrentTab(window) {
    const tabData = this._extension.tabManager.convert(window.gBrowser.selectedTab);
    const incognito = tabData.incognito
      // autofrget tab
      || (window.gBrowser.selectedBrowser.loadContext
          && window.gBrowser.selectedBrowser.loadContext.usePrivateBrowsing);

    return {
      incognito,
      ...tabData
    };
  }

  _generateEventManager(context, eventName) {
    return new EventManager({
      context,
      name: 'dropdown.onMessage',
      register: (fire) => {
        const listener = (_, window, data) => {
          const details = { data };
          const id = this._getWindowId(window);
          if (context.viewType === 'background') {
            details.windowId = id;
            fire.sync(details);
          }
        };
        this.on(eventName, listener);
        return () => {
          this.off(eventName, listener);
        };
      }
    }).api();
  }

  receiveMessage({ target, data }) {
    return this.emit('message', this._getWindowId(target.ownerGlobal), data);
  }

  navigateTo(windowId, url, options) {
    const { urlbar } = this._getDropdown(windowId);
    const gURLBar = urlbar.ownerGlobal.gURLBar;
    const inputField = gURLBar.inputField;

    const controller = gURLBar.controller;
    const { selectionStart, selectionEnd, value, focused } = gURLBar;
    const visibleValue = inputField.value;

    urlbar.value = url;
    if (controller.input) {
      controller.input.value = url;
    }
    gURLBar.handleCommand(null, options.target);
    if (options.target === 'tabshifted') {
      if (focused) {
        urlbar.focus();
      }
      gURLBar.value = value;
      inputField.value = visibleValue;
      gURLBar.selectionStart = selectionStart;
      gURLBar.selectionEnd = selectionEnd;
    }
  }

  getAPI(context) {
    return {
      override: options => this.override(context, options),
      restore: () => this.restore(context),
      getResult: (windowId) => {
        const { dropdownManager } = this._getDropdown(windowId);
        const selected = dropdownManager.selectedResult || null;
        const hovered = dropdownManager.hoveredResult || null;
        return {
          selected,
          hovered,
        };
      },
      update: (windowId = null, { value }) => {
        const { urlbar } = this._getDropdown(windowId);
        if (typeof value === 'string') {
          urlbar.value = value;
        }
      },
      query: (windowId = null, query, options) => {
        const { urlbar, dropdownManager } = this._getDropdown(windowId);
        if (options.focus) {
          urlbar.focus();
        }
        if (options.openLocation) {
          const command = urlbar.ownerDocument.getElementById('Browser:OpenLocation');
          command.doCommand();
        }
        urlbar.value = query;
        urlbar.mInputField.value = query;
        dropdownManager.onInput();
      },
      navigateTo: (windowId, url, options) => this.navigateTo(windowId, url, options),
      onTelemetryPush: this._generateEventManager(context, 'telemetry'),
    };
  }
}
