'use strict';

const npa = require('npm-package-arg');
const v = require('./versions');

/**
 *
 * @param {BoobenProjectModel} model
 * @param {string} [version='1.0.0']
 * @return {string}
 */
const generatePackageJSONFile = (model, { version = '1.0.0' } = {}) => {
  const packageJSON = {
    name: model.project.name,
    description: 'App made with booben',
    version,
    author: model.project.author,
    license: 'UNLICENSED',
    private: true,
    dependencies: {
      react: v('react'),
      'react-dom': v('react-dom'),
      'react-router': v('react-router'),
      'react-router-dom': v('react-router-dom'),
      'react-scripts': v('react-scripts'),
      'styled-components': v('styled-components'),
    },
    scripts: {
      start: 'react-scripts start',
      build: 'react-scripts build',
      test: 'react-scripts test --env=jsdom',
      eject: 'react-scripts eject',
    },
  };

  model.project.componentLibs.forEach(lib => {
    const { name, rawSpec } = npa(lib);
    packageJSON.dependencies[name] = rawSpec;
  });

  if (model.usingGraphQL) {
    packageJSON.dependencies['apollo-client'] = v('apollo-client');
    packageJSON.dependencies['react-apollo'] = v('react-apollo');
    packageJSON.dependencies['apollo-link-http'] = v('apollo-link-http');
    packageJSON.dependencies['apollo-cache-inmemory'] = v(
      'apollo-cache-inmemory'
    );
    packageJSON.dependencies['graphql-tag'] = v('graphql-tag');
    packageJSON.dependencies['apollo-link-context'] = v('apollo-link-context');
  }

  return JSON.stringify(packageJSON, null, 2);
};

module.exports = generatePackageJSONFile;
