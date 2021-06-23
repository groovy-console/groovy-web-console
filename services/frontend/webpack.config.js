const path = require( 'path' );


const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {

    // bundling mode
    mode: 'production',

    // entry files
    entry: './src/ts/index.ts',

    // output bundles (location)
    output: {
        path: path.resolve( __dirname, 'dist' ),
        filename: 'app.js',
        crossOriginLoading: 'anonymous',
    },

    // file resolutions
    resolve: {
        extensions: [ '.ts', '.js' ],
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
    plugins: [
        new HtmlWebpackPlugin({
            // template: './src/index.html'
        })
    ],
};
