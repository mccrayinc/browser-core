import { afterIframeRemoved } from './sites-specific';
import { createElement } from './utils';
import * as styles from './styles/index';

const WAIT_BEFORE_SHOWING = 50;
const DEBUG = false;

export default class View {
  constructor({ onaction, window, config }) {
    this.window = window;
    this.onaction = onaction;
    this.iframe = null;
    this.wrapper = null;
    this.config = config;
  }

  unload() {
    if (this.config.type === 'browser-panel') { afterIframeRemoved(this.window); }
    this.iframe.remove();
    this.wrapper.remove();
    this.iframe = null;
    this.window = null;
    this.onaction = null;
    this.config = null;
  }

  makeVisible() {
    const waitMapper = {
      'offers-cc': 200,
      'browser-panel': 200,
      'offers-reminder': 350,
    };
    setTimeout(() => {
      const isBrowserPanel = this.config.type === 'browser-panel';
      this.wrapper.style.opacity = 1;
      this.iframe.style.opacity = 1;
      if (isBrowserPanel) {
        this.onaction({ handler: 'offerShown', data: {} });
        this.onaction({ handler: 'offersFirstAppearance', data: {} });
      }
      styles.animate(this.config.type, this.wrapper, this.config.styles);
    }, waitMapper[this.config.type] || WAIT_BEFORE_SHOWING);
  }

  resize({ width, height }) {
    this.iframe.style.height = `${height}px`;
    this.iframe.style.width = `${width}px`;
  }

  changePositionWithAnimation({ deltaRight = 0, duration }) {
    const right = Number((this.wrapper.style.right || '0').replace(/\D/g, ''));
    const animationsOptions = { animation: true, duration, first: right, last: right + deltaRight };
    styles.animate(this.config.type, this.wrapper, animationsOptions);
  }

  changePosition({ deltaRight = 0, allowNegativeRight = false }) {
    const right = Number((this.wrapper.style.right || '0').replace(/\D/g, ''));
    if (!allowNegativeRight && right + deltaRight < 0) { return; }
    this.wrapper.style.right = `${right + deltaRight}px`;
  }

  sendToIframe(payload) {
    const mapper = {
      'offers-cc': ['cliqz-offers-cc', 'pushData'],
      'browser-panel': ['cqz-browser-panel-re', 'render_template'],
      'offers-reminder': ['cliqz-offers-reminder', 'pushData'],
    };
    const [target, action] = mapper[this.config.type] || ['cliqz-offers-cc', 'pushData'];
    this.iframe.contentWindow.postMessage(JSON.stringify({
      target,
      origin: 'window',
      message: { action, data: payload },
    }), '*');
  }

  render(bannerId) {
    if (this.window.document.getElementById(bannerId)) { return; }

    let wrapper = createElement(this.window, { tag: 'div', id: bannerId });
    const iframe = createElement(this.window, { tag: 'iframe' });
    Object.assign(wrapper.style, styles.wrapper(this.config.type, this.config.styles));
    Object.assign(iframe.style, styles.banner(this.config.type, this.config.styles));

    this.window.document.body.appendChild(wrapper);
    this.wrapper = wrapper;
    this.iframe = iframe;

    const head = this.window.document.head;
    if (head.createShadowRoot || head.attachShadow) {
      wrapper = wrapper.attachShadow({ mode: DEBUG ? 'open' : 'closed' });
    }

    iframe.frameBorder = 0;
    iframe.style.height = '0px';
    wrapper.appendChild(iframe);
    iframe.src = this.config.url;
  }
}
