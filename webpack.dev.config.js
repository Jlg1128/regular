const path = require('path');
const webpack = require('webpack');

module.exports = {
  devtool: 'source-map',
  mode: 'development',
  entry: {
    main: './lib/index.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: "regular.js",
    library: {
      name: 'Regular',
      type: 'umd',
    },
  },
  mode: 'development',
  watch: true,
  resolveLoader: {
  },
  module: {
  },
  resolve: {
  },
  plugins: [
  ],
};
