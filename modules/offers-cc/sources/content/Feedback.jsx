import React from 'react';
import { css, i18n, chooseProduct } from './common/utils';

const _css = css('feedback__');
export default class Feedback extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      text: '',
      vote: '',
    };
  }

  renderButtons() {
    const { products } = this.props;
    const { text, vote } = this.state;
    const disabled = !text && !vote;
    const prefix = chooseProduct(products);
    const cls = disabled
      ? ['disabled', `${prefix}-disabled`]
      : ['primary', `${prefix}-primary`];
    return (
      <li className={_css('buttons')}>
        <button
          disabled={disabled}
          type="button"
          onClick={() => !disabled && this.props.onChange({ text, vote })}
          className={_css('button', ...cls)}
        >
          {i18n('send')}
        </button>
        <button
          type="button"
          onClick={() => this.props.onSkip({ text: '' })}
          className={_css('button', 'secondary', `${prefix}-secondary`)}
        >
          {i18n('skip')}
        </button>
      </li>
    );
  }

  render() {
    return (
      <div className={_css('wrapper')}>
        <div className={_css('container', this.props.shouldPad ? 'padding' : '')}>
          <div className={_css('notification')}>
            {i18n('offer_removed')}
          </div>
          <p className={_css('title')}>
            {i18n('feedback_title')}
            <span className={_css('optional')}>{i18n('feedback_optional')}</span>
          </p>
          <ul className={_css('list')}>
            <li className={_css('list-item')}>
              <input
                onClick={e => this.setState({ vote: e.target.value })}
                type="radio"
                name="remove_feedback"
                id="feedback_option1"
                value="already_used"
              />
              <label
                className={_css('label')}
                htmlFor="feedback_option1"
              >
                {i18n('feedback_option1')}
              </label>
            </li>
            <li className={_css('list-item')}>
              <input
                onClick={e => this.setState({ vote: e.target.value })}
                type="radio"
                name="remove_feedback"
                id="feedback_option2"
                value="not_good_deal"
              />
              <label
                className={_css('label')}
                htmlFor="feedback_option2"
              >
                {i18n('feedback_option2')}
              </label>
            </li>
            <li className={_css('list-item')}>
              <input
                onClick={e => this.setState({ vote: e.target.value })}
                type="radio"
                name="remove_feedback"
                id="feedback_option3"
                value="not_relevant"
              />
              <label
                className={_css('label')}
                htmlFor="feedback_option3"
              >
                {i18n('feedback_option3')}
              </label>
            </li>
            <li>
              <textarea
                onChange={e => this.setState({ text: e.target.value })}
                value={this.state.text}
                className={_css('field')}
                rows="3"
                cols="26"
                placeholder={i18n('feedback_option4')}
              />
            </li>
            {this.renderButtons()}
          </ul>
        </div>
      </div>
    );
  }
}
