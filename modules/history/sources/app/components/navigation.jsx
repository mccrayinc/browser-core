import React from 'react';
import PropTypes from 'prop-types';

const Navigation = ({ urls: { NEW_TAB_URL, HISTORY_URL } }) => (
  <nav className="navigation">
    <span><a href={NEW_TAB_URL} className="freshtab-button">Home</a></span>
    <span><a href={HISTORY_URL} className="history-button">History</a></span>
  </nav>
);

Navigation.propTypes = {
  urls: PropTypes.exact({
    NEW_TAB_URL: PropTypes.string,
    HISTORY_URL: PropTypes.string,
  })
};

export default Navigation;
