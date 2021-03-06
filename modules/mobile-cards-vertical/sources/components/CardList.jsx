/*!
 * Copyright (c) 2014-present Cliqz GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import React from 'react';
import { FlatList, View } from 'react-native';
import Card from './Card';
import SearchEngineCard from './SearchEngineCard';
import { withCliqz } from '../cliqz';

class CardList extends React.PureComponent {
  constructor(props) {
    super(props);
    this.viewabilityConfig = {
      itemVisiblePercentThreshold: 50, // TODO: to be configured
    };
    this.lastText = '';
    this.lastUrl = '';
  }

  getSelection = (result, url, elementName) => {
    const props = this.props;
    const meta = props.meta;
    const selection = {
      action: 'click',
      elementName,
      isFromAutoCompletedUrl: false,
      isNewTab: false,
      isPrivateMode: false,
      isPrivateResult: meta.isPrivate,
      query: result.text,
      rawResult: {
        index: props.index,
        ...result,
      },
      resultOrder: meta.resultOrder,
      url,
    };
    return selection;
  }

  openLink = (result, url, elementName = '') => {
    const selection = this.getSelection(result, url, elementName);
    this.props.cliqz.mobileCards.openLink(url, selection);
  }

  getComponent = ({ item, index }) => {
    let Component;
    switch (item.type) {
      case 'supplementary-search':
        Component = SearchEngineCard;
        break;
      default:
        Component = Card;
    }
    return (
      <Component
        key={item.meta.domain}
        openLink={(...args) => this.openLink(item, ...args)}
        result={item}
        index={index}
      />
    );
  }

  onViewableItemsChanged = ({ viewableItems: [{ item } = {}] }) => {
    if (!item) {
      // TODO: check logic when no items viewed
      return;
    }
    const { friendlyUrl, text } = item;
    if (friendlyUrl !== this.lastUrl || text !== this.lastText) {
      this.props.cliqz.mobileCards.handleAutocompletion(friendlyUrl, text);
      this.lastUrl = friendlyUrl;
      this.lastText = text;
    }
  }

  componentDidUpdate() {
    if (!this._cardsList) {
      return;
    }
    this._cardsList.scrollToIndex({ index: 0 });
  }

  componentWillUnmount() {
    this._cardsList = null;
  }

  getSeparator = () => (this.props.separator || <View style={{ marginTop: 16 }} />)

  getFooter = () => (this.props.footer || <View style={{ marginTop: 16 }} />)

  getHeader = () => (this.props.header || <View style={{ marginTop: 16 }} />)

  render() {
    const { results, cliqz } = this.props;
    if (!results.length) {
      return null;
    }
    const listStyle = {
      paddingLeft: 10,
      paddingRight: 10,
      ...(this.props.style || {}),
    };

    return (
      <FlatList
        ref={(cardsList) => { this._cardsList = cardsList; }}
        bounces={false}
        data={results}
        keyExtractor={item => item.url}
        renderItem={this.getComponent}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={this.getSeparator}
        ListHeaderComponent={this.getHeader}
        ListFooterComponent={this.getFooter}
        onTouchStart={() => cliqz.mobileCards.hideKeyboard()}
        onScrollEndDrag={() => cliqz.search.reportHighlight()}
        viewabilityConfig={this.viewabilityConfig}
        onViewableItemsChanged={this.onViewableItemsChanged}
        listKey="cards"
        style={listStyle}
      />
    );
  }
}

export default withCliqz(CardList);
