const common = [
  '--require-module', 'ts-node/register',
  '--require', 'tests/steps/**/*.ts',
  '--format', 'progress',
  '--publish-quiet'
].join(' ');

module.exports = {
  default: `${common} tests/features`
};
