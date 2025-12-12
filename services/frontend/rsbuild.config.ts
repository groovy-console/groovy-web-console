import { defineConfig, rspack } from '@rsbuild/core'
import { pluginSass } from '@rsbuild/plugin-sass'

export default defineConfig(({ envMode }) => ({
  source: {
    entry: {
      index: './src/ts/index.ts'
    }
  },
  html: {
    template: './src/templates/index.html'
  },
  output: {
    assetPrefix: './'
  },
  plugins: [
    pluginSass()
  ],
  tools: {
    rspack: {
      plugins: [
        new rspack.DefinePlugin({
          GROOVY_CONSOLE_SERVICE_URL: JSON.stringify(envMode === 'production' ? 'https://europe-west1-gwc-experiment.cloudfunctions.net/' : 'http://localhost:9080/'),
          LOCAL_DEVELOPMENT: JSON.stringify(envMode === 'development')
        }),
        new rspack.CopyRspackPlugin({
          patterns: [
            { from: './src/static/', to: '.' }
          ]
        })
      ]
    }
  },
  server: {
    port: 9000,
    host: 'localhost'
  }
}))
