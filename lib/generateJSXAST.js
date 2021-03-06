'use strict';

const t = require('babel-types');
const generateBoobenValueAST = require('./generateBoobenValueAST');
const Path = require('./Path');
const { parseComponentName } = require('./misc');
const { INVALID_ID } = require('./constants');

const {
  formatComponentSaveRefMethodName,
  formatStateKeyForProp,
  formatDesignedComponentName,
  formatComponentStateSlotKey,
  formatStyleClassName,
} = require('./names');

/**
 *
 * @param {string} methodName
 * @return {JSXAttribute}
 */
const generateRefAttribute = methodName =>
  t.jSXAttribute(
    t.jSXIdentifier('ref'),
    t.jSXExpressionContainer(
      t.memberExpression(t.thisExpression, t.identifier(methodName))
    )
  );

const generateCssAttribute = name =>
  t.jSXAttribute(t.jSXIdentifier('className'), t.stringLiteral(name));

const generateStateAttribute = (propName, stateKey) =>
  t.jSXAttribute(
    t.jSXIdentifier(propName),
    t.jSXExpressionContainer(
      t.callExpression(
        t.memberExpression(
          t.memberExpression(t.thisExpression(), t.identifier('state')),
          t.identifier(stateKey)
        ),
        []
      )
    )
  );

/**
 *
 * @param {string} propName
 * @param {Object} component
 * @param {ComponentFileModel} file
 * @return {JSXAttribute}
 */
const generateAttribute = (propName, component, file, model) => {
  const propFromState = file.propsState.get(component.id);
  if (propFromState && propFromState.has(propName)) {
    const stateKey = formatStateKeyForProp(component, propName, false);

    // /*propName*/={this.state./*stateKey*/()}
    return t.jSXAttribute(
      t.jSXIdentifier(propName),
      t.jSXExpressionContainer(
        t.callExpression(
          t.memberExpression(
            t.memberExpression(t.thisExpression(), t.identifier('state')),
            t.identifier(stateKey)
          ),
          []
        )
      )
    );
  } else {
    const path = new Path([
      { type: Path.StepTypes.COMPONENT_ID, value: component.id },
      { type: Path.StepTypes.SWITCH, value: 'props' },
      { type: Path.StepTypes.COMPONENT_PROP_NAME, value: propName },
    ]);

    const value = component.props[propName];

    if (file.css.has(component.id)) {
      const name = formatStyleClassName(file.name, component.id);
      if (propName === 'className') {
        value.sourceData.value = [value.sourceData.value, name].join(' ');
      }
    }

    const valueExpression = generateBoobenValueAST(value, path, file, model);

    if (t.isStringLiteral(valueExpression)) {
      // /*propName*/="/*valueExpression*/"
      return t.jSXAttribute(t.jSXIdentifier(propName), valueExpression);
    } else {
      // /*propName*/={/*valueExpression*/}
      return t.jSXAttribute(
        t.jSXIdentifier(propName),
        t.jSXExpressionContainer(valueExpression)
      );
    }
  }
};

/**
 *
 * @param {Object} textComponent
 * @param {ComponentFileModel} file
 * @param {boolean} wrap
 * @return {JSXText|JSXExpressionContainer|Expression}
 */
const generateText = (textComponent, file, wrap) => {
  if (!textComponent.props.text) {
    return null;
  }

  const path = new Path([
    { type: Path.StepTypes.COMPONENT_ID, value: textComponent.id },
    { type: Path.StepTypes.SWITCH, value: 'props' },
    { type: Path.StepTypes.COMPONENT_PROP_NAME, value: 'text' },
  ]);

  const textAST = generateBoobenValueAST(textComponent.props.text, path, file);

  if (wrap) {
    if (t.isStringLiteral(textAST)) {
      return t.jSXText(textAST.value);
    } else {
      return t.jSXExpressionContainer(textAST);
    }
  } else {
    return textAST;
  }
};

/**
 *
 * @param {Object} outletComponent
 * @param {ComponentFileModel} file
 * @param {BoobenProjectModel} model
 * @return {JSXElement}
 */
const generateRouterSwitchElement = (outletComponent, file, model) => {
  const route = model.routes[file.routeId];

  if (route.children.length === 0) {
    return null;
  }

  const childRouteElements = route.children.map(childRouteId => {
    const childRoute = model.routes[childRouteId];
    const childRouteComponentName = childRoute.file.name;

    return t.jSXElement(
      t.jSXOpeningElement(
        t.jSXIdentifier('Route'),
        [
          t.jSXAttribute(
            t.jSXIdentifier('path'),
            t.stringLiteral(childRoute.fullPath)
          ),
          t.jSXAttribute(
            t.jSXIdentifier('component'),
            t.jSXExpressionContainer(t.identifier(childRouteComponentName))
          ),
        ],
        true
      ),
      null,
      []
    );
  });

  if (route.haveIndex) {
    const indexRouteFile = route.indexFile;
    const indexRouteComponentName = indexRouteFile.name;

    childRouteElements.unshift(
      t.jSXElement(
        t.jSXOpeningElement(
          t.jSXIdentifier('Route'),
          [
            t.jSXAttribute(
              t.jSXIdentifier('path'),
              t.stringLiteral(route.fullPath)
            ),
            t.jSXAttribute(t.jSXIdentifier('exact')),
            t.jSXAttribute(
              t.jSXIdentifier('component'),
              t.jSXExpressionContainer(t.identifier(indexRouteComponentName))
            ),
          ],
          true
        ),
        null,
        []
      )
    );
  }

  return t.jSXElement(
    t.jSXOpeningElement(t.jSXIdentifier('Switch'), []),
    t.jSXClosingElement(t.jSXIdentifier('Switch')),
    childRouteElements
  );
};

/**
 *
 * @param {Object} listComponent
 * @param {ComponentFileModel} file
 * @param {boolean} wrap
 * @return {JSXExpressionContainer|Expression}
 */
const generateList = (listComponent, file, wrap) => {
  if (!listComponent.props.data || !listComponent.props.component) {
    return null;
  }

  const dataPropPath = new Path([
    { type: Path.StepTypes.COMPONENT_ID, value: listComponent.id },
    { type: Path.StepTypes.SWITCH, value: 'props' },
    { type: Path.StepTypes.COMPONENT_PROP_NAME, value: 'data' },
  ]);

  const itemComponentPropPath = new Path([
    { type: Path.StepTypes.COMPONENT_ID, value: listComponent.id },
    { type: Path.StepTypes.SWITCH, value: 'props' },
    { type: Path.StepTypes.COMPONENT_PROP_NAME, value: 'component' },
  ]);

  const itemComponentName = formatDesignedComponentName(itemComponentPropPath);

  // /* dataValue */.map((item, idx) => </* ComponentName */ key={idx} item={item} />)
  const expression = t.callExpression(
    t.memberExpression(
      generateBoobenValueAST(listComponent.props.data, dataPropPath, file),
      t.identifier('map')
    ),
    [
      t.arrowFunctionExpression(
        [t.identifier('item'), t.identifier('idx')],
        t.jSXElement(
          t.jSXOpeningElement(
            t.jSXIdentifier(itemComponentName),
            [
              t.jSXAttribute(
                t.jSXIdentifier('key'),
                t.jSXExpressionContainer(t.identifier('idx'))
              ),
              t.jSXAttribute(
                t.jSXIdentifier('item'),
                t.jSXExpressionContainer(t.identifier('item'))
              ),
            ],
            true
          ),
          null,
          []
        ),
        false
      ),
    ]
  );

  return wrap ? t.jSXExpressionContainer(expression) : expression;
};

/**
 *
 * @param {Object} component
 * @param {ComponentFileModel} file
 * @param {BoobenProjectModel} model
 * @return {JSXElement|JSXText|JSXExpressionContainer}
 */
const generateJSXElement = (component, file, model) => {
  if (!component) return t.nullLiteral();
  const { id, name: componentName, props, children, systemProps } = component;
  const { namespace, name } = parseComponentName(componentName);
  if (namespace === '') {
    const isRootComponent = component.parentId === INVALID_ID;

    if (name === 'Text') {
      return generateText(component, file, !isRootComponent);
    } else if (name === 'List') {
      return generateList(component, file, !isRootComponent);
    } else if (name === 'Outlet') {
      return generateRouterSwitchElement(component, file, model);
    } else {
      throw new Error(`Unknown pseudo-component: ${name}`);
    }
  }

  let hasClassnameProp = false;

  const attributes = Object.keys(props).map(propName => {
    if (propName === 'className') {
      hasClassnameProp = true;
    }
    return generateAttribute(propName, component, file, model);
  });

  if (file.css.has(id) && !hasClassnameProp) {
    const name = formatStyleClassName(file.name, id);
    attributes.push(generateCssAttribute(name));
  }

  if (file.refs.has(id)) {
    const methodName = formatComponentSaveRefMethodName(component);
    attributes.push(generateRefAttribute(methodName));
  }

  if (file.activeStateSlots.has(id)) {
    const stateSlots = file.activeStateSlots.get(id);
    for (const propName of stateSlots.values()) {
      const stateKey = formatComponentStateSlotKey(component, propName);
      attributes.push(generateStateAttribute(propName, stateKey));
    }
  }

  const childElements = [];
  children.forEach(childId => {
    const childElement = generateJSXElement(
      file.components[childId],
      file,
      model
    );

    if (childElement !== null) {
      childElements.push(childElement);
    }
  });

  const isSelfClosing = childElements.length === 0;

  const JSXElementAST = t.jSXElement(
    t.jSXOpeningElement(t.jSXIdentifier(name), attributes, isSelfClosing),
    isSelfClosing ? null : t.jSXClosingElement(t.jSXIdentifier(name)),
    childElements
  );

  if (file.systemPropsState.has(id)) {
    if (file.systemPropsState.get(id).has('visible')) {
      const stateKey = formatStateKeyForProp(component, 'visible', true);
      return t.jSXExpressionContainer(
        t.logicalExpression(
          '&&',
          t.callExpression(
            t.memberExpression(
              t.memberExpression(t.thisExpression(), t.identifier('state')),
              t.identifier(stateKey)
            ),[]
          ),
          JSXElementAST
        )
      );
    }
  }

  const path = new Path([
    { type: Path.StepTypes.COMPONENT_ID, value: component.id },
    { type: Path.StepTypes.SWITCH, value: 'systemProps' },
    { type: Path.StepTypes.COMPONENT_PROP_NAME, value: 'visible' },
  ]);

  const visibleValueAST = generateBoobenValueAST(
    systemProps.visible,
    path,
    file,
    model
  );

  // omit useless {true && JSXElement structures}
  if (
    visibleValueAST.type === 'BooleanLiteral' &&
    visibleValueAST.value === true
  ) {
    return JSXElementAST;
  }

  if (component.parentId !== INVALID_ID) {
    return t.jSXExpressionContainer(
      t.logicalExpression('&&', visibleValueAST, JSXElementAST)
    );
  }

  return JSXElementAST;
};

/**
 *
 * @param {ComponentFileModel} file
 * @param {BoobenProjectModel} model
 * @return {JSXElement}
 */
const generateJSXAST = (file, model) => {
  const rootComponent = file.components[file.rootComponentId];
  return generateJSXElement(rootComponent, file, model);
};

module.exports = generateJSXAST;
