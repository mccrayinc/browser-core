/*!
 * Copyright (c) 2014-present Cliqz GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import React from 'react';
import PropTypes from 'prop-types';

import AsideElement from './partials/aside-element';
import Settings from './settings';
import t from '../i18n';

function AsideRight({
  isSettingsOpen,
  hasHistorySpeedDialsToRestore,
  onBackgroundImageChanged,
  onDeveloperModulesOpen,
  onNewsSelectionChanged,
  restoreHistorySpeedDials,
  shouldShowSearchSwitch,
  config = {},
  toggleBackground,
  toggleBlueTheme,
  toggleComponent,
  toggleSettings,
}) {
  const shouldShowDeveloperModulesIcon = config.developer === true
    || config.isBetaVersion === true;

  return (
    <aside className="aside">
      {isSettingsOpen && (
        <Settings
          blueTheme={config.blueTheme}
          browserTheme={config.browserTheme}
          componentsState={config.componentsState}
          hasHistorySpeedDialsToRestore={hasHistorySpeedDialsToRestore}
          isBlueThemeSupported={config.isBlueThemeSupported}
          isBrowserThemeSupported={config.isBrowserThemeSupported}
          isAllPrefsLinkSupported={config.isAllPrefsLinkSupported}
          isStatsSupported={config.isStatsSupported}
          onBackgroundImageChanged={onBackgroundImageChanged}
          onNewsSelectionChanged={onNewsSelectionChanged}
          restoreHistorySpeedDials={restoreHistorySpeedDials}
          shouldShowSearchSwitch={shouldShowSearchSwitch}
          toggle={toggleSettings}
          toggleBackground={toggleBackground}
          toggleBlueTheme={toggleBlueTheme}
          toggleComponent={toggleComponent}
          wallpapers={config.wallpapers}
        />
      )}

      <AsideElement
        condition={isSettingsOpen}
        id="settings-btn"
        isAndOperator={false}
        isButton
        label="Settings"
        onClick={toggleSettings}
        title={t('cliqz_tab_settings_button')}
      />

      {shouldShowDeveloperModulesIcon && (
        <AsideElement
          condition={shouldShowDeveloperModulesIcon}
          id="cliqz-modules-btn"
          isButton
          label={t('cliqz_modules_button')}
          onClick={onDeveloperModulesOpen}
          title={t('cliqz_modules_button')}
        />
      )}
    </aside>
  );
}

AsideRight.propTypes = {
  config: PropTypes.object,
  hasHistorySpeedDialsToRestore: PropTypes.bool,
  isSettingsOpen: PropTypes.bool,
  onBackgroundImageChanged: PropTypes.func,
  onDeveloperModulesOpen: PropTypes.func,
  onNewsSelectionChanged: PropTypes.func,
  restoreHistorySpeedDials: PropTypes.func,
  shouldShowSearchSwitch: PropTypes.bool,
  toggleBackground: PropTypes.func,
  toggleBlueTheme: PropTypes.func,
  toggleComponent: PropTypes.func,
  toggleSettings: PropTypes.func,
};

export default AsideRight;
