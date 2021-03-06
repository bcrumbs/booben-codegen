const fs = require('mz/fs');
const thenify = require('thenify');
const rimraf = thenify(require('rimraf'));
const prettyMs = require('pretty-ms');
const { parseGraphQLSchema } = require('booben-graphql-schema');
const getGraphQLSchema = require('./getGraphQLSchema');
const buildModel = require('./buildModel');
const generateFiles = require('./generateFiles');
const writeFiles = require('./writeFiles');
const { defaultContainerId } = require('./constants');
const archiveProject = require('./archiveProject');

/**
 *
 * @return {void}
 */
const noop = () => {};

/**
 * @typedef {Object} Logger
 * @property {function(message: *)} log
 * @property {function(message: *)} info
 * @property {function(message: *)} warn
 * @property {function(message: *)} error
 */

/**
 *
 * @type {Logger}
 */
const dummyLogger = {
  log: noop,
  info: noop,
  warn: noop,
  error: noop,
};

/**
 *
 * @param {Object} boobenProject
 * @param {string} outputDir
 * @param {string} [version]
 * @param {string} [urlPrefix]
 * @param {string} [containerId]
 * @param {?Object} [outputFs]
 * @param {boolean} [clean]
 * @param {Logger} [logger]
 * @return {Promise<void>}
 */
const generateProject = async (
  boobenProject,
  outputDir,
  meta,
  {
    version = '1.0.0',
    urlPrefix = '/',
    containerId = defaultContainerId,
    fs: outputFs = null,
    clean = true,
    logger = dummyLogger,
  } = {}
) => {
  const startTime = Date.now();

  await rimraf(outputDir);
  await fs.mkdir(outputDir);

  logger.log('Gathering metadata');

  let schema = null;
  if (boobenProject.graphQLEndpointURL) {
    logger.log(
      `Downloading GraphQL schema from ${boobenProject.graphQLEndpointURL}`
    );

    const graphQLSchema = await getGraphQLSchema(
      boobenProject.graphQLEndpointURL
    );

    logger.log('Parsing GraphQL schema');
    schema = parseGraphQLSchema(graphQLSchema);
  }

  logger.log('Building model');
  const model = buildModel(boobenProject, meta, schema);

  logger.log('Generating files');
  const files = generateFiles(model, {
    version,
    urlPrefix,
    containerId,
  });

  logger.log('Writing files');
  await writeFiles(files, outputDir, outputFs);

  logger.log('Building archive folder');
  await archiveProject(outputDir);

  const totalTime = Date.now() - startTime;
  logger.log(`Done in ${prettyMs(totalTime)}`);
};

module.exports = generateProject;
