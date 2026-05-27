import { defineConfig } from 'cypress'
import createBundler from '@bahmutov/cypress-esbuild-preprocessor'
import { createEsbuildPlugin } from '@badeball/cypress-cucumber-preprocessor/esbuild'
import { addCucumberPreprocessorPlugin } from '@badeball/cypress-cucumber-preprocessor'
import allureWriter from '@shelex/cypress-allure-plugin/writer'
import * as dotenv from 'dotenv'

dotenv.config()

const configName = process.env.CYPRESS_ENV || 'qa'
const envSettings = require(`./cypress.env.${configName}.json`)

export default defineConfig({
  e2e: {
    baseUrl: envSettings.apiBaseUrl,
    specPattern: 'cypress/e2e/**/*.feature',
    stepDefinitions: 'cypress/e2e/step_definitions/**/*.ts',
    supportFile: 'cypress/support/e2e.ts',
    setupNodeEvents: async (on, config) => {
      const bundler = createBundler({
        plugins: [createEsbuildPlugin(config)],
      })

      on('file:preprocessor', bundler)

      await addCucumberPreprocessorPlugin(on, config)
      allureWriter(on, config)

      return { ...config, env: { ...config.env, ...envSettings } }
    },
  },
  reporter: 'spec',
  env: {
    apiBaseUrl: envSettings.apiBaseUrl,
    username: envSettings.username,
    password: envSettings.password,
  },
})
