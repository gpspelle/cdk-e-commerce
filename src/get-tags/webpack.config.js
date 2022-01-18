const path = require('path');

module.exports = {
  entry: './index.js',
  mode: 'production',
  optimization: {
    minimize: true,
    sideEffects: false,
  },
  context: path.resolve(__dirname),
  externals: ['aws-sdk', 'aws-lambda'], // provided by the AWS Lambda runtime, no need to bundle
  output: {
    filename: 'main.js',
    libraryTarget: 'commonjs',
  },
  target: 'node',
};