# VWO Test Architecture — Lucid Chart Diagrams

## Diagram 1: End-to-End Test Pipeline

```
Developer pushes code
        │
        ▼
  GitHub Pull Request
        │
        ▼
  CI Trigger (Jenkins)
        │
    ┌───┴───┐
    │       │
    ▼       ▼
 Unit    Static
 Tests   Analysis
(TestNG) (Checkstyle)
    │       │
    └───┬───┘
        │ Both pass
        ▼
  Build & Package
  (Maven / npm)
        │
        ▼
  Deploy to Staging
  (Docker → K8s)
        │
        ▼
  Smoke Tests
  (Selenium / Playwright — 15 min)
        │
   ┌────┴────┐
   │ Pass    │ Fail
   ▼         ▼
Regression  Notify
  Suite     Team
(2–3 hrs)  (Slack)
   │
   ▼
Performance
  Tests
(JMeter — 30 min)
   │
   ▼
 Approval
 Gate
   │
   ▼
 Deploy to
Production
```

---

## Diagram 2: Selenium Framework Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Test Layer                         │
│  TestNG Test Classes (@Test methods)                │
│  DataProviders (Excel / JSON test data)             │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│               Page Object Layer                      │
│  LoginPage   DashboardPage   CampaignPage            │
│  HeatmapPage  ReportPage     SettingsPage            │
│  (Locators + Actions, no assertions here)            │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              Base Framework Layer                    │
│  DriverFactory  (Chrome / Firefox / Safari)          │
│  WaitUtils      (Explicit waits, retry logic)        │
│  ConfigReader   (environment.properties)             │
│  ExtentReports  (HTML report generation)             │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              WebDriver / Browser                     │
│  ChromeDriver  GeckoDriver  SafariDriver             │
│  Grid (Selenium Hub → Node 1, Node 2, Node 3)        │
└─────────────────────────────────────────────────────┘
```

### Key Packages
| Package | Purpose |
|---|---|
| `com.vwo.tests` | TestNG test classes |
| `com.vwo.pages` | Page Object classes |
| `com.vwo.utils` | Helpers (wait, config, report) |
| `com.vwo.data` | Test data providers |
| `com.vwo.base` | DriverFactory, BaseTest |

---

## Diagram 3: Playwright Framework Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Test Layer                         │
│  *.spec.ts files                                    │
│  test('description', async ({ page }) => { ... })   │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│               Page Object Layer                      │
│  LoginPage.ts   DashboardPage.ts                     │
│  CampaignPage.ts   ReportPage.ts                     │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              Fixture Layer                           │
│  fixtures/auth.ts   (auto-login setup)               │
│  fixtures/api.ts    (API request context)            │
│  fixtures/data.ts   (seeded test data)               │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              Playwright Core                         │
│  Chromium   Firefox   WebKit                        │
│  playwright.config.ts (retries, timeout, workers)   │
└─────────────────────────────────────────────────────┘
```

### Playwright Config Summary
```
workers: 4          (parallel test execution)
retries: 2          (auto-retry on failure)
timeout: 30000      (30s per test step)
reporter: allure    (HTML report)
projects:
  - chromium (desktop)
  - firefox (desktop)
  - webkit (safari)
  - mobile-chrome
  - mobile-safari
```

---

## Diagram 4: VWO Campaign Execution Flow

```
Visitor lands on page
        │
        ▼
  VWO SmartCode fires
  (synchronous, <head>)
        │
        ▼
  Is visitor eligible?
  (URL match + segment check)
        │
   ┌────┴─────┐
   │ No       │ Yes
   ▼          ▼
 Exit      Is visitor
(no exp)   already bucketed?
              │
          ┌───┴───┐
          │ Yes   │ No
          ▼       ▼
     Show same  Run traffic
     variation  allocation
     as before  algorithm
                  │
                  ▼
           Store bucket in
           1st-party cookie
           _vwo_uuid
                  │
                  ▼
           Apply variation
           (DOM changes)
                  │
                  ▼
           Track impression
           (async API call)
                  │
                  ▼
           User interacts
                  │
                  ▼
           Goal triggered?
                  │
              ┌───┴───┐
              │ Yes   │ No
              ▼       ▼
         Track conv.  Session ends
         (async call) (no conversion)
```

---

## Diagram 5: QA Environment Architecture

```
                    ┌─────────────────┐
                    │   Local Dev     │
                    │  (localhost)    │
                    └────────┬────────┘
                             │
               ┌─────────────▼─────────────┐
               │       Staging             │
               │  staging.vwo.com          │
               │  - Mirrors production     │
               │  - Synthetic data only    │
               │  - Smoke + Regression run │
               └─────────────┬─────────────┘
                             │
               ┌─────────────▼─────────────┐
               │       Pre-Prod            │
               │  preprod.vwo.com          │
               │  - Production config      │
               │  - Performance tests run  │
               │  - UAT sign-off here      │
               └─────────────┬─────────────┘
                             │
               ┌─────────────▼─────────────┐
               │      Production           │
               │  app.vwo.com              │
               │  - Post-deploy smoke only │
               │  - Monitoring: DataDog    │
               └───────────────────────────┘
```

### Environment Config Matrix
| Environment | Data | VWO SmartCode | Payments |
|---|---|---|---|
| Local | Mock | Disabled | Sandbox |
| Staging | Synthetic | Test account | Sandbox |
| Pre-Prod | Anonymised prod clone | Live | Sandbox |
| Production | Real | Live | Live |

---

## Diagram 6: Defect Lifecycle Flow

```
Tester finds bug
      │
      ▼
 Create JIRA ticket
 (Severity + Steps + Screenshot)
      │
      ▼
 Dev Lead triages
      │
   ┌──┴──┐
   │     │
   ▼     ▼
Accept  Reject
   │   (Not a bug /
   │    Won't fix /
   ▼    Duplicate)
 Assign to Dev
      │
      ▼
 Dev fixes in
 feature branch
      │
      ▼
 PR review + CI
      │
      ▼
 QA verifies fix
 in staging
      │
   ┌──┴──┐
   │     │
   ▼     ▼
Pass   Fail → Reopen ticket
   │
   ▼
 Close JIRA ticket
 (add fix commit SHA)
```
