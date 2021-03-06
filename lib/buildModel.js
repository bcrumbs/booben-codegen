'use strict';

const { forOwn, isEmpty } = require('lodash');
const walkBoobenValue = require('./walkBoobenValue');

const {
  formatRouteComponentName,
  formatRouteIndexComponentName,
} = require('./names');

const Path = require('./Path');
const { normalizeRoutes, parseComponentName } = require('./misc');
const { INVALID_ID, FileTypes } = require('./constants');

const walkComponentsTree = (components, rootId, visitor) => {
  if (isEmpty(components)) return;
  if (rootId === INVALID_ID) return;
  const visitComponent = component => {
    visitor(component);
    component.children.forEach(childId => {
      walkComponentsTree(components, childId, visitor);
    });
  };

  visitComponent(components[rootId]);
};

/**
 * @typedef {Object} ComponentFileModel
 * @property {number} type
 * @property {string} name
 * @property {number} routeId
 * @property {Object<number, Object>} components
 * @property {number} rootComponentId
 * @property {Map<string, Set<string>>} importComponents
 * @property {Map<string, { path: Path, actions: Array<Object> }>} handlers
 * @property {Set<number>} refs
 * @property {Map<number, Set<string>>} activeStateSlots
 * @property {Map<number, Set<string>>} propsState
 * @property {Map<number, Set<string>>} systemPropsState
 * @property {Set<string>} importProjectFunctions
 * @property {Set<string>} importBuiltinFunctions
 * @property {boolean} needRouteParams
 * @property {Set<string>} importHelpers
 * @property {Set<string>} importFiles
 * @property {boolean} usingReactRouter
 * @property {Array<ComponentFileModel>} nestedFiles
 */

/**
 *
 * @param {number} type
 * @param {string} name
 * @return {ComponentFileModel}
 */
const createFile = (type, name) => ({
  type,
  name,
  routeId: INVALID_ID,
  components: null,
  rootComponentId: INVALID_ID,
  importComponents: new Map(), // Map of namespace => Set of component names
  handlers: new Map(), // Map of serialized path => array of actions
  refs: new Set(), // Set of component ids
  activeStateSlots: new Map(), // Map of component id => Set of state slot names
  routePaths: new Map(), //Map of routes id => full route path
  propsState: new Map(), // Map of component id => Set of prop names
  systemPropsState: new Map(), // Map of component id => Set of prop names
  importProjectFunctions: new Set(), // Set of function names
  importBuiltinFunctions: new Set(), // Set of function names
  needRouteParams: false,
  importHelpers: new Set(), // Set of helper names
  importFiles: new Set(), // Set of file names
  usingReactRouter: false,
  nestedFiles: [],
  usingGraphQL: false,
  queries: new Map(),
  mutations: new Map(),
  css: new Map(),
  auth: null,
});

/**
 *
 * @param {Object} model
 * @param {ComponentFileModel} file
 * @param {Object<number, Object>} components
 * @param {number} rootComponentId
 * @return {void}
 */
const collectFileData = (model, file, components, rootComponentId) => {
  file.components = components;
  file.rootComponentId = rootComponentId;

  walkComponentsTree(components, rootComponentId, component => {
    const { namespace, name } = parseComponentName(component.name);
    const { style, id } = component;

    if (style) {
      file.css.set(id, style);
    }

    if (file.type === FileTypes.DESIGNED_COMPONENT) {
      file.usingReactRouter = true;
    }

    if (namespace) {
      if (!file.importComponents.has(namespace)) {
        file.importComponents.set(namespace, new Set([name]));
      } else {
        file.importComponents.get(namespace).add(name);
      }
    } else {
      if (name === 'Outlet') {
        if (file.type !== FileTypes.ROUTE) {
          throw new Error('Found Outlet in a non-route file');
        }

        const route = model.routes[file.routeId];
        if (route.children.length > 0 || route.haveIndex) {
          file.usingReactRouter = true;
          route.children.forEach(childId => {
            const childRoute = model.routes[childId];
            const fileName = formatRouteComponentName(childRoute);
            file.importFiles.add(fileName);
          });

          if (route.haveIndex) {
            const fileName = formatRouteIndexComponentName(route);
            file.importFiles.add(fileName);
          }
        }
      }
    }

    const emitFile = (name, type, components, rootComponentId) => {
      const newFile = createFile(type, name);
      collectFileData(model, newFile, components, rootComponentId);
      file.nestedFiles.push(newFile);
    };

    forOwn(component.props, (propValue, propName) => {
      walkBoobenValue(
        propValue,
        model,
        file,
        new Path([
          { type: Path.StepTypes.COMPONENT_ID, value: component.id },
          { type: Path.StepTypes.SWITCH, value: 'props' },
          { type: Path.StepTypes.COMPONENT_PROP_NAME, value: propName },
        ]),
        emitFile
      );
    });

    forOwn(component.systemProps, (propValue, propName) => {
      walkBoobenValue(
        propValue,
        model,
        file,
        new Path([
          { type: Path.StepTypes.COMPONENT_ID, value: component.id },
          { type: Path.StepTypes.SWITCH, value: 'systemProps' },
          { type: Path.StepTypes.COMPONENT_PROP_NAME, value: propName },
        ]),
        emitFile
      );
    });
  });
};

/**
 * @typedef {Object} BoobenProjectModel
 * @property {Object} project
 * @property {Object<string, CodegenLibMetadata>} meta
 * @property {Object<number, Object>} routes
 * @property {Array<number>} rootRoutes
 * @property {Object<string, Object>} functions
 * @property {Array<ComponentFileModel>} files
 * @property {boolean} usingGraphQL
 */

/**
 *
 * @param {Object} boobenProject
 * @param {Object<string, CodegenLibMetadata>} meta
 * @param {?DataSchema} schema
 * @return {BoobenProjectModel}
 */
const buildModel = (boobenProject, meta, schema) => {
  const model = {
    project: boobenProject,
    meta,
    routes: normalizeRoutes(boobenProject.routes),
    redirects: [],
    rootRoutes: boobenProject.routes.map(route => route.id),
    functions: boobenProject.functions,
    files: [],
    usingGraphQL: false,
    schema,
    helpers: {
      openUrl: false,
      logout: false,
    },
  };

  if (model.project.graphQLEndpointURL) {
    model.usingGraphQL = true;
  }

  forOwn(model.routes, route => {
    if (route.redirect) {
      model.redirects.push({
        type: 'always',
        from: route.fullPath,
        to: route.redirectTo,
      });
    }

    if (route.redirectAuthenticated) {
      model.redirects.push({
        type: 'hasAuth',
        from: route.fullPath,
        to: route.redirectAuthenticatedTo,
      });
    }

    if (route.redirectAnonymous) {
      model.redirects.push({
        type: 'anonymous',
        from: route.fullPath,
        to: route.redirectAnonymousTo,
      });
    }

    const routeFile = createFile(
      FileTypes.ROUTE,
      formatRouteComponentName(route)
    );
    routeFile.routeId = route.id;
    collectFileData(model, routeFile, route.components, route.rootComponentId);
    route.file = routeFile;

    forOwn(model.routes, route => {
      routeFile.routePaths.set(route.id, route.fullPath);
    });

    model.files.push(routeFile);

    if (route.haveIndex) {
      const indexFile = createFile(
        FileTypes.ROUTE_INDEX,
        formatRouteIndexComponentName(route)
      );

      indexFile.routeId = route.id;
      collectFileData(
        model,
        indexFile,
        route.components,
        route.indexComponentId
      );
      route.indexFile = indexFile;
      model.files.push(indexFile);
    }
  });

  return model;
};

module.exports = buildModel;
