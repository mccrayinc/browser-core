'use strict';
/* global document, osAPI */

import LongPress from 'mobile-touch/longpress';
import { environment, handlebars, utils } from 'core/cliqz';

var historyTimer;
var editMode = false;
var selectedQueries = [];
var selectedHistory = [];
var allHistory = [];
var allFavorites = [];

function showHistory(history) {
  clearTimeout(historyTimer);

  allHistory = history;
  const queries = environment.getLocalStorage().getObject('recentQueries', []).reverse();

  for (let i = 0; i < history.length; i++) {
    history[i].domain = history[i].url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i)[1];
  }

  const data = mixHistoryWithQueries(queries, history);
  History.displayData(data, History.showOnlyFavorite);
}

function showFavorites(favorites) {
  clearTimeout(historyTimer);

  allFavorites = favorites;
  const favoriteHistory = favorites;

  const favoriteQueries = environment.getLocalStorage().getObject('favoriteQueries', []);

  for (let i = 0; i < favoriteHistory.length; i++) {
    favoriteHistory[i].domain = favoriteHistory[i].url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i)[1];
  }

  const data = mixHistoryWithQueries(favoriteQueries, favoriteHistory);
  History.displayData(data, History.showOnlyFavorite);
}

function sendShowTelemetry(data) {
  const queryCount = data.filter(function (item) { return item.query; }).length,
      urlCount = data.filter(function (item) { return item.url; }).length;
  utils.telemetry({
    type: History.showOnlyFavorite ? 'favorites' : 'history',
    action: 'show',
    active_day_count: data.length - queryCount - urlCount,
    query_count: queryCount,
    url_count: urlCount
  });
}


function mixHistoryWithQueries(queries, history) {
  let data = [];
  let hi = 0;
  let qi = 0;
  let date = '';
  while (true) {
    if (hi >= history.length || qi >= queries.length) {
      break;
    }

    if (history[hi].timestamp <= queries[qi].timestamp) {
      if (getDateFromTimestamp(history[hi].timestamp) !== date) {
        data.push({date: getDateFromTimestamp(history[hi].timestamp)});
        date = getDateFromTimestamp(history[hi].timestamp);
      }
      data.push(history[hi]);

      hi++;
    } else {
      if (getDateFromTimestamp(queries[qi].timestamp) !== date) {
        data.push({date: getDateFromTimestamp(queries[qi].timestamp)});
        date = getDateFromTimestamp(queries[qi].timestamp);
      }
      data.push(queries[qi]);
      qi++;
    }
  }
  while (hi < history.length) {
    if (getDateFromTimestamp(history[hi].timestamp) !== date) {
      data.push({date: getDateFromTimestamp(history[hi].timestamp)});
      date = getDateFromTimestamp(history[hi].timestamp);
    }
    data.push(history[hi]);
    hi++;
  }
  while (qi < queries.length) {
    if (getDateFromTimestamp(queries[qi].timestamp) !== date) {
      data.push({date: getDateFromTimestamp(queries[qi].timestamp)});
      date = getDateFromTimestamp(queries[qi].timestamp);
    }
    data.push(queries[qi]);
    qi++;
  }

  return data;
}

function displayData(data, isFavorite = false) {
  if (!handlebars.tplCache['conversations']) {
    return setTimeout(History.displayData, 100, data);
  }

  document.body.innerHTML = handlebars.tplCache['conversations']({data: data, isFavorite});

  const B = document.body,
      H = document.documentElement;

  let height;

  if (typeof document.height !== 'undefined') {
      height = document.height; // For webkit browsers
  } else {
      height = Math.max( B.scrollHeight, B.offsetHeight,H.clientHeight, H.scrollHeight, H.offsetHeight );
  }

  document.body.scrollTop = height + 100;

  document.getElementById('search_input').addEventListener('keyup', function() {
      filterHistory(this.value);
  });

  function onTap(element) {
    const type = element.getAttribute('class');
    const clickAction = type.indexOf('question') >= 0 ? osAPI.notifyQuery : osAPI.openLink;
    if (editMode) {
      selectItem(element);
    } else {
      clickAction(element.getAttribute('data'));
      sendClickTelemetry(element);
    }
  }
  new LongPress('.question, .answer', launchEditMode, onTap);

  History.sendShowTelemetry(data);
}

function launchEditMode(element) {

  if (editMode) {
    endEditMode();
    launchEditMode(element);
  } else {
    let checkboxes = Array.from(document.getElementsByClassName('edit__delete'));
    checkboxes.forEach(function(checkbox){
      checkbox.style.display = 'block';
    });
    let div = document.getElementById('control');
    div.style.display = 'block';
    editMode = true;
    selectedQueries = [];
    selectedHistory = [];
    selectItem(element);
  }
}

function endEditMode() {
  const framers = [].slice.call(document.getElementsByClassName('framer'));
  framers.forEach(item => item.setAttribute('class', 'framer'));

  const checkboxes = Array.from(document.getElementsByClassName('edit__delete'));
  checkboxes.forEach(function(element){
    let checkbox = element.querySelector('input');
    checkbox.checked = false;
    element.style.display = 'none';
  });

  let div = document.getElementById('control');
  div.style.display = 'none';
  editMode = false;
  selectedQueries = [];
  selectedHistory = [];
}

function getDateFromTimestamp(time) {
    const d = new Date(time);

    let days = d.getDate();
    days = days > 9 ? days : '0' + days;

    let months = d.getMonth()+1;
    months = months > 9 ? months : '0' + months;

    const year = d.getFullYear();

    const formatedDate = days + '.' + months + '.' + year;
    return formatedDate;
}
function filterHistory(value) {
    var framers = document.getElementsByClassName('framer');
    for (let i = 0; i < framers.length; i++) {
        if (framers[i].childNodes[1].firstChild.textContent.toLowerCase().match(value.toLowerCase())) {
            framers[i].parentNode.style.display = 'block';
        } else {
            framers[i].parentNode.style.display = 'none';
        }
    }
}


function favoriteSelected() {
  setQueryFavorite();
  if (selectedHistory.length > 0) {
    setHistoryFavorite();
  }
  endEditMode();
  update();
}

function setQueryFavorite() {
  let favoriteQueries = environment.getLocalStorage().getObject('favoriteQueries', []);
  selectedQueries.forEach((item) => {
    for (let i = 0; i < favoriteQueries.length; i++) {
      if (item.query === favoriteQueries[i].query) {
        favoriteQueries.splice(i, 1);
        break;
      }
    }
    if (!History.showOnlyFavorite) {
      favoriteQueries.push({query: item.query, timestamp: item.timestamp});
    }
  });

  environment.getLocalStorage().setObject('favoriteQueries', favoriteQueries);
}

function setHistoryFavorite() {
  selectedHistory.forEach((item) => {
    for (let i = 0; i < allFavorites.length; i++) {
      if (item.url === allFavorites[i].url) {
        allFavorites.splice(i, 1);
        break;
      }
    }
    if (!History.showOnlyFavorite) {
      allFavorites.push({url: item.url, timestamp: item.timestamp, title:item.title});
    }
  });
  osAPI.setFavorites(selectedHistory, !History.showOnlyFavorite);
}

function removeQueries() {
  let queries = environment.getLocalStorage().getObject('recentQueries', []);

  const queryIds = selectedQueries.map(query => query.id);
  queries = queries.filter(query => queryIds.indexOf(query.id) === -1);
  environment.getLocalStorage().setObject('recentQueries', queries);
}

function removeHistoryItems(ids) {
  allHistory = allHistory.filter(history => ids.indexOf(history.id) === -1);
  osAPI.removeHistoryItems(ids);
}

function removeSelected() {
  if (selectedQueries.length > 0) {
    removeQueries();
  }
  if (selectedHistory.length > 0) {
    removeHistoryItems(selectedHistory.map(item => item.id));
  }
  endEditMode();
  update();
}

function selectQuery(item) {
  for (let i = 0; i < selectedQueries.length; i++) {
    if (selectedQueries[i].id === item.id) {
      selectedQueries.splice(i, 1);
      return;
    }
  }
  selectedQueries.push(item);
}

function selectHistory(item) {
  for (let i = 0; i < selectedHistory.length; i++) {
    if (selectedHistory[i].id === item.id) {
      selectedHistory.splice(i, 1);
      return;
    }
  }
  selectedHistory.push(item);
}

function selectItem(item) {
  let checkbox = item.querySelector('input');
  checkbox.checked = !checkbox.checked;

  const id = parseInt(item.dataset.id);
  const data = item.getAttribute('data');
  const title = item.dataset.title;
  const timestamp = Date.now();
  item.getAttribute('class').indexOf('question') >= 0 ? selectQuery({id, query:data, title, timestamp}) : selectHistory({id, url:data, title, timestamp});

  let framer = item.getElementsByClassName('framer')[0];
  if (framer.getAttribute('class').indexOf('selected') >= 0) {
    framer.setAttribute('class', 'framer');
  } else {
    framer.setAttribute('class', 'framer selected');
  }
  if (selectedQueries.length + selectedHistory.length === 0) {
    endEditMode();
  }
}

function init(onlyFavorites = History.showOnlyFavorite) {
  migrateQueries();
  History.showOnlyFavorite = onlyFavorites;
  const callback = onlyFavorites ? showFavorites : showHistory;
  historyTimer = setTimeout(callback, 200, {results: []});
  onlyFavorites ? osAPI.getFavorites('History.showFavorites') : osAPI.getHistoryItems('History.showHistory');
}

function update() {
  History.showOnlyFavorite ? showFavorites(allFavorites) : showHistory(allHistory);
}

function clearHistory() {
  environment.getLocalStorage().setObject('recentQueries', []);
}

function clearFavorites() {
  environment.getLocalStorage().setObject('favoriteQueries', []);
}

function sendClickTelemetry(element) {
  const targeType = element.className === 'question' ? 'query' : 'url';
    utils.telemetry({
      type: History.showOnlyFavorite ? 'favorites' : 'history',
      action: 'click',
      target_type: targeType,
      target_index: parseInt(element.dataset.index),
      target_length: element.querySelector('.' + targeType).textContent.length,
      target_ts: parseInt(element.dataset.timestamp)
    });
}

/**
  This function is for migration of history and favorite queries
  to extension version Mobile Extension 3.5.2
**/
function migrateQueries() {
  if (environment.getLocalStorage().getItem('isFavoritesRefactored')) {
    return;
  }
  let queries = environment.getLocalStorage().getObject('recentQueries', []);
  let favoriteQueries = environment.getLocalStorage().getObject('favoriteQueries', []);
  queries = queries.map(query => {
    if (query.favorite) {
      favoriteQueries.unshift({query: query.query, timestamp: query.timestamp});
    }
    delete query.favorite;
    return query;
  });
  environment.getLocalStorage().setObject('recentQueries', queries);
  environment.getLocalStorage().setObject('favoriteQueries', favoriteQueries);
  environment.getLocalStorage().setItem('isFavoritesRefactored', true);
}


var History = {
  init,
  showHistory,
  showFavorites,
  clearHistory,
  clearFavorites,
  favoriteSelected,
  removeSelected,
  endEditMode,
  displayData,
  sendShowTelemetry,
  showOnlyFavorite: false
};

export default History;
