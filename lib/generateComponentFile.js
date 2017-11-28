'use strict';

const generate = require('babel-generator').default;
const template = require('babel-template');
const t = require('babel-types');
const generateImportsAST = require('./generateImportsAST');
const generateHandlerAST = require('./generateHandlerAST');
const generateStateAST = require('./generateStateAST');
const generateRefsAST = require('./generateRefsAST');
const generateJSXAST = require('./generateJSXAST');

const declarationsTemplate = template(
  `
    IMPORTS
    
    class COMPONENT_NAME extends React.Component {
      constructor(props, context) {
        super(props, context);
        STATE
        INIT_REFS
        BIND_SAVE_REFS
        BIND_HANDLERS
      }
      
      // Other methods will be inserted here manually after executing this template
      
      render() {
        return JSX;
      }
    }
    
    COMPONENT_NAME.displayName = COMPONENT_NAME_STRING;
    
    export default COMPONENT_NAME;
  `,
  {
    sourceType: 'module',
    plugins: ['jsx'],
  }
);

/**
 *
 * @param {ComponentFileModel} file
 * @param {JssyProjectModel} model
 * @return {string}
 */
const generateComponentFile = (file, model) => {
  const importASTs = generateImportsAST(file, model);
  const handlersAST = [];
  const handlerBindingsAST = [];

  file.handlers.forEach(handler => {
    const { handlerAST, handlerBindingAST } = generateHandlerAST(handler, file);
    handlersAST.push(handlerAST);
    handlerBindingsAST.push(handlerBindingAST);
  });

  const stateAST = generateStateAST(file, model);
  const { initRefASTs, saveRefASTs, bindSaveRefASTs } = generateRefsAST(file);
  const jsxAST = generateJSXAST(file, model);

  const declarations = declarationsTemplate({
    IMPORTS: importASTs,
    COMPONENT_NAME: t.identifier(file.name),
    COMPONENT_NAME_STRING: t.stringLiteral(file.name),
    STATE: stateAST || [],
    INIT_REFS: initRefASTs,
    BIND_SAVE_REFS: bindSaveRefASTs,
    BIND_HANDLERS: handlerBindingsAST,
    JSX: jsxAST,
  });

  let classDeclaration = null;
  for (let i = 0; i < declarations.length; i++) {
    if (t.isClassDeclaration(declarations[i])) {
      classDeclaration = declarations[i];
      break;
    }
  }

  if (classDeclaration !== null) {
    classDeclaration.body.body.splice(1, 0, ...saveRefASTs, ...handlersAST);
  }

  const fileAST = t.file(t.program(declarations));

  return generate(fileAST).code;
};

module.exports = generateComponentFile;