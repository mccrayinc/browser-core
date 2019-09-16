/*!
 * Copyright (c) 2014-present Cliqz GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

const path = require('path');
const Funnel = require('broccoli-funnel');
const MergeTrees = require('broccoli-merge-trees');
const broccoliSource = require('broccoli-source');
const writeFile = require('broccoli-file-creator');

const cliqzConfig = require('../config');
const util = require('../util');

const subprojects = require(path.resolve(__dirname, '../../configs/common/subprojects/bundles'));

const UnwatchedDir = broccoliSource.UnwatchedDir;

const FILES_WITH_PLACEHOLDERS = {
  freshtab: [
    'home.html',
  ],
};

module.exports = function getDistTree(modulesTree) {
  const modulesTrees = [
    new Funnel(modulesTree, {
      include: cliqzConfig.modules.map(name => `${name}/dist/**/*`),
      exclude: ['**/messages.json'], // remove translations
      getDestinationPath(_path) {
        return _path.replace('/dist', '');
      },
    })
  ];

  const suprojectsSet = new Set();
  const getSubprojects = (moduleName) => {
    try {
      const { subprojects = [] } = require(path.resolve(__dirname, `../../modules/${moduleName}/build-config`));
      subprojects.forEach((project) => {
        suprojectsSet.add(project);
      });
    } catch (error) {
      // this error is expected, because not all the modules have 'build-config.json'
    }
  };

  cliqzConfig.modules.forEach((mod) => {
    getSubprojects(mod);
  });

  cliqzConfig.subprojects = subprojects(Array.from(suprojectsSet));

  const distTrees = modulesTrees.concat(
    (cliqzConfig.subprojects || []).map(
      subproject =>
        new Funnel(new UnwatchedDir(subproject.src), {
          include: subproject.include || ['**/*'],
          destDir: subproject.dest,
          getDestinationPath(filename) {
            return filename.replace('.development', '').replace('.production.min', '').replace('.profiling.min', '');
          },
        })
    )
  );

  const distTree = new MergeTrees(distTrees);

  const config = writeFile('cliqz.json', JSON.stringify(cliqzConfig));

  const files = cliqzConfig.modules.reduce((all, module) => {
    const fileNames = (FILES_WITH_PLACEHOLDERS[module] || []).map(name => `${module}/${name}`);
    return all.concat(fileNames);
  }, []);

  const distWithConfig = util.injectConfig(distTree, config, 'cliqz.json', files);

  return new MergeTrees([
    distTree,
    distWithConfig,
  ], { overwrite: true });
};
