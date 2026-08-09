const PACKAGE_PATHS = Object.freeze({
  "@greenways/hodos-web": "../../vendor/hodos/packages/web/src/index.js",
  "@greenways/hodos-workspace-ui": "../../vendor/hodos/packages/workspace-ui/src/index.js",
  "@greenways/hodos-2d": "../../vendor/hodos/packages/2d/src/index.js",
  "@greenways/hodos-2d-ui": "../../vendor/hodos/packages/2d-ui/src/index.js",
  "@greenways/hodos-dev": "../../vendor/hodos/packages/dev/src/index.js",
  "@greenways/hodos-dev-ui": "../../vendor/hodos/packages/dev-ui/src/index.js",
});

export async function resolve(specifier, context, nextResolve) {
  const path = PACKAGE_PATHS[specifier];
  if (path) {
    return {
      url: new URL(path, import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
