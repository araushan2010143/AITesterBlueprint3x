const reporter = require('cucumber-html-reporter');
const fs = require('fs');
const path = require('path');

const reportsDir = path.join(__dirname, '../reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

const env = process.env.NODE_ENV || 'qa';
const jsonPath = path.join(__dirname, `../reports/cucumber-${env}.json`);
const htmlPath = path.join(__dirname, `../reports/cucumber-${env}.html`);

if (!fs.existsSync(jsonPath)) {
  console.error(`JSON report not found at ${jsonPath}. Run the tests first.`);
  process.exit(1);
}

const options = {
  theme: 'bootstrap',
  jsonFile: jsonPath,
  output: htmlPath,
  reportSuiteAsScenarios: true,
  launchReport: false,
  metadata: {
    'Test Environment': env,
    'Generated': new Date().toISOString()
  }
};

reporter.generate(options);
console.log(`HTML report generated at ${htmlPath}`);
