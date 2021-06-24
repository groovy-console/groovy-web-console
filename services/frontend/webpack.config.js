const path = require('path');


const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {

    // bundling mode
    mode: 'production',

    // entry files
    entry: './src/ts/index.ts',

    // output bundles (location)
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].[contenthash].js',
        crossOriginLoading: 'anonymous',
    },

    // file resolutions
    resolve: {
        extensions: ['.ts', '.js'],
    },
    optimization: {
        usedExports: true,
        // https://webpack.js.org/plugins/split-chunks-plugin/
        runtimeChunk: 'single',
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
                    reuseExistingChunk: true,
                },
                vendor: {
                    test: /[\\/]node_modules[\\/](?!pako)/,
                    name: 'vendors',
                    chunks: 'all',
                    priority: -10,
                    reuseExistingChunk: true,
                },
            },
        },
    },

    // loaders
    module: {
        rules: [
            {
                test: /\.tsx?/,
                use: 'ts-loader',
                exclude: /node_modules/,
            }
        ]
    },

    // generate source map
    devtool: 'source-map',
    devServer: {
        contentBase: path.join(__dirname, 'dist'),
        compress: true,
        port: 9000,
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/templates/index.html'
        }),
        // copy css
        new CopyPlugin({
            patterns: [
                {from: "./src/resources/", to: path.join(__dirname, 'dist')},
            ],
        }),
    ],
};
