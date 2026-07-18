# VWO Wireframes — Screen Flows & Layout Specifications

## 1. Onboarding Flow

### Screen 1.1 — Welcome / Account Setup
```
┌─────────────────────────────────────────┐
│  VWO Logo                               │
│                                         │
│  Welcome to VWO                         │
│  Let's set up your account              │
│                                         │
│  [Company Name          ]               │
│  [Website URL           ]               │
│  [Industry dropdown ▾   ]               │
│  [Team size dropdown ▾  ]               │
│                                         │
│  [  Continue →  ]                       │
│                                         │
│  Step 1 of 3  ●──────                   │
└─────────────────────────────────────────┘
```
**QA Checks:** URL validation (must include https://). Industry and team size are required. Back navigation preserves form state.

### Screen 1.2 — SmartCode Installation
```
┌─────────────────────────────────────────┐
│  Install VWO SmartCode                  │
│                                         │
│  Paste this in your <head> tag:         │
│  ┌─────────────────────────────┐        │
│  │ <script>... </script>      │  [Copy] │
│  └─────────────────────────────┘        │
│                                         │
│  [Verify Installation]                  │
│                                         │
│  ✅ SmartCode detected on your site      │
│                                         │
│  [← Back]          [Continue →]         │
└─────────────────────────────────────────┘
```
**QA Checks:** Copy button copies snippet to clipboard and shows "Copied!" tooltip. Verify button polls the site (5s timeout). Success state enables Continue. Failure shows "SmartCode not found" with troubleshooting link.

---

## 2. Campaign Builder Flow

### Screen 2.1 — Campaign Type Selection
```
┌──────────────────────────────────────────────────────┐
│  What type of campaign do you want to create?        │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │  [Icon]  │  │  [Icon]  │  │  [Icon]  │           │
│  │  A/B     │  │ Split    │  │  Multi-  │           │
│  │  Test    │  │ URL Test │  │ variate  │           │
│  └──────────┘  └──────────┘  └──────────┘           │
│                                                      │
│  ┌──────────┐                                        │
│  │  [Icon]  │                                        │
│  │ Personal-│                                        │
│  │ isation  │                                        │
│  └──────────┘                                        │
└──────────────────────────────────────────────────────┘
```
**QA Checks:** Single selection only (clicking one deselects others). Hover shows tooltip with description. Keyboard navigation (arrow keys) cycles through options.

### Screen 2.2 — Visual Editor
```
┌─────────────────────────────────────────────────────────┐
│ [←Back] Campaign Name      [Preview▾] [Save] [Launch]   │
├───────────────────┬─────────────────────────────────────┤
│ VARIATIONS        │                                     │
│ ● Control         │   [ Live page preview renders here ]│
│ ● Variation 1  ✎  │                                     │
│ + Add Variation   │   (Click elements to edit)          │
│                   │                                     │
│ CHANGES (3)       │                                     │
│ • H1 text         │                                     │
│ • Button color    │                                     │
│ • Image src       ├─────────────────────────────────────┤
│                   │ [Text] [CSS] [HTML] [Image] [Attrs] │
└───────────────────┴─────────────────────────────────────┘
```
**QA Checks:** Undo (Ctrl+Z) reverts last change. Switching variations in left panel updates preview. Changes list shows element type + change type. Save auto-saves draft every 30 seconds.

---

## 3. Reports Layout

### Screen 3.1 — Campaign Report Overview
```
┌─────────────────────────────────────────────────────────┐
│ Campaign: Checkout CTA Test    [Running] [Pause] [···]  │
│ 15 Jul – present    Goal: Button Click    Traffic: 50%  │
├──────────┬──────────┬──────────┬──────────┬────────────┤
│          │ Control  │ Var. 1   │ Var. 2   │ Winner     │
├──────────┼──────────┼──────────┼──────────┼────────────┤
│ Visitors │ 4,211    │ 4,198    │ 4,203    │ —          │
│ Conv.    │ 312      │ 401      │ 389      │ 🏆 Var. 1  │
│ Conv. %  │ 7.41%    │ 9.55%    │ 9.26%    │            │
│ Lift     │ baseline │ +28.9%   │ +24.9%   │            │
│ Signif.  │ baseline │ 97.2%    │ 95.1%    │            │
└──────────┴──────────┴──────────┴──────────┴────────────┘
│                                                         │
│  [Conversion Rate Over Time — Line Chart]               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```
**QA Checks:** Winner row only appears when significance ≥ 95%. Chart updates on goal dropdown change. Hovering data points shows tooltip with date, visitors, conversions. Table sortable by any column.

---

## 4. Heatmap Module Layout

### Screen 4.1 — Heatmap View
```
┌─────────────────────────────────────────────────────────┐
│ Heatmaps    [Date: Last 30 days ▾] [Device: All ▾]     │
│ [Click] [Move] [Scroll]                                 │
├──────────────────────────────────┬──────────────────────┤
│                                  │ SUMMARY              │
│   [ Heatmap overlay on top of    │ Total clicks: 8,432  │
│     screenshot of the page ]     │ Unique visitors: 2.1k│
│                                  │ Top clicked: #cta-btn│
│   🔴 Hot spots visible           │                      │
│   🟡 Medium activity             │ TOP ELEMENTS         │
│   🔵 Low activity                │ 1. #cta-button  34%  │
│                                  │ 2. .nav-logo    18%  │
│                                  │ 3. #pricing-tab 12%  │
└──────────────────────────────────┴──────────────────────┘
```

---

## 5. Settings — Integration Cards

### Screen 5.1 — Integrations Page
```
┌─────────────────────────────────────────────────────────┐
│ Integrations                                            │
│                                                         │
│ ┌─────────────────────┐  ┌─────────────────────┐       │
│ │ [GA Logo]           │  │ [Segment Logo]      │       │
│ │ Google Analytics    │  │ Segment             │       │
│ │ ● Connected         │  │ ○ Not Connected     │       │
│ │ [Disconnect]        │  │ [Connect]           │       │
│ └─────────────────────┘  └─────────────────────┘       │
│                                                         │
│ ┌─────────────────────┐  ┌─────────────────────┐       │
│ │ [Slack Logo]        │  │ [HubSpot Logo]      │       │
│ │ Slack               │  │ HubSpot             │       │
│ │ ○ Not Connected     │  │ ● Connected         │       │
│ │ [Connect]           │  │ [Disconnect]        │       │
│ └─────────────────────┘  └─────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```
**QA Checks:** "Connect" opens OAuth popup (600×700px). Popup close without authorizing shows no change in status. "Disconnect" shows confirmation modal: "Remove [Name] integration? This will stop syncing data." Status badge updates within 5 seconds of action.

---

## 6. Mobile Responsive Wireframes

### Mobile Navigation (< 768px)
```
┌──────────────────┐
│ ☰   VWO    👤   │  ← Top bar
├──────────────────┤
│                  │
│  [Page content]  │
│                  │
│                  │
├──────────────────┤
│ 📊  🔥  📹  ⚙️  │  ← Bottom tab bar
│ Camp Insights Rec Set│
└──────────────────┘
```

### Mobile Campaign Card
```
┌──────────────────────────┐
│ Checkout CTA Test        │
│ 🟢 Running               │
│                          │
│ Visitors    8,412        │
│ Conv. Rate  9.55%  +28%  │
│                          │
│ [View Report]  [···]     │
└──────────────────────────┘
```
**QA Checks:** Bottom tab bar replaces sidebar on mobile. Cards stack vertically (no grid). Report table scrolls horizontally inside its container (body does not scroll sideways). Touch targets minimum 44×44px.
