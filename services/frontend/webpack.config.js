const path = require('path')

const CopyPlugin = require('copy-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin')

module.exports = {

  // bundling mode
  mode: 'production',

  // entry files
  entry: './src/ts/index.ts',

  // output bundles (location)
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    crossOriginLoading: 'anonymous'
  },

  // file resolutions
  resolve: {
    extensions: ['.ts', '.js']
  },
  optimization: {
    usedExports: true,
    // https://webpack.js.org/plugins/split-chunks-plugin/
    runtimeChunk: 'single',
    minimizer: [
      '...', // For webpack@5 you can use the `...` syntax to extend existing minimizers (i.e. `terser-webpack-plugin`)
      new CssMinimizerPlugin()
    ],
    splitChunks: {
      cacheGroups: {
        /*
                  Split pako into it's own chunk since we only need it when we use either the codez parameter,
                  or saving the current script into a string. So we can use lazy loading for that module.
                 */
        pako: {
          test: /[\\/]node_modules[\\/]pako[\\/]/,
          name: 'pako',
          chunks: 'async',
          priority: 5,
          enforce: true,
          reuseExistingChunk: true
        },
        vendor: {
          test: /[\\/]node_modules[\\/](?!pako)/,
          name: 'vendors',
          chunks: 'all',
          priority: -10,
          reuseExistingChunk: true
        }
      }
    }
  },

  // loaders
  module: {
    rules: [
      {
        test: /\.tsx?/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.s[ac]ss$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader'
          },
          {
            loader: 'sass-loader',
            options: {
              sourceMap: true
              // options...
            }
          }
        ]
      }
    ]
  },

  // generate source map
  devtool: 'source-map',
  devServer: {
    contentBase: path.join(__dirname, 'dist'),
    compress: true,
    port: 9000
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/templates/index.html'
    }),
    // copy css
    new CopyPlugin({
      patterns: [
        { from: './src/static/', to: path.join(__dirname, 'dist') }
      ]
    }),
    new MiniCssExtractPlugin({
      filename: '[name].[contenthash].css'
    })
  ]
}
