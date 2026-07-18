# VWO User Guides — QA Reference

## Guide 1: Creating Your First A/B Test

### Prerequisites
- Active VWO account with Editor or Admin role
- Website with VWO SmartCode installed on target pages
- Clear hypothesis: what you are testing and why

### Steps

**Step 1 — Start a campaign**
Go to Campaigns → click "Create Campaign" → select "A/B Test".

**Step 2 — Name your campaign**
Use a descriptive name: `[Module] [What you're testing] [Date]`
Example: `Checkout CTA Button Color — July 2026`

**Step 3 — Set the URL**
Enter the page URL where the test will run. Use "Substring Match" for dynamic URLs (e.g. `/product/*`).

**Step 4 — Create variations**
Click "Add Variation" → use the Visual Editor to change elements.
- Click any element to edit text, colour, CSS, or HTML
- Changes are non-destructive; original page = Control (Variation-0)

**Step 5 — Set goals**
Click "Goals" → Add Goal → select type:
- **Click Goal:** Pick an element with the CSS selector tool
- **Page Visit Goal:** Enter the URL of the success page (e.g. `/order-confirmation`)
- **Revenue Goal:** Requires VWO revenue tracking snippet on checkout page

**Step 6 — Configure traffic**
Set % of total site traffic sent to the experiment (e.g. 50%).
Set traffic split between variations (e.g. 50% Control / 50% Variation-1).

**Step 7 — Launch**
Review summary → click "Start Campaign". Status changes to "Running".

---

## Guide 2: Reading Campaign Reports

### Metrics Explained

| Metric | Definition |
|---|---|
| Visitors | Unique visitors bucketed into this campaign |
| Conversions | Visitors who completed the primary goal |
| Conversion Rate | Conversions / Visitors × 100 |
| Improvement | % lift of variation over control conversion rate |
| Statistical Significance | Confidence that the result is not due to chance (target ≥ 95%) |
| P-value | Probability the result is random (target < 0.05) |

### Declaring a Winner
VWO declares a winner when:
1. Statistical significance ≥ 95%
2. Minimum 100 conversions per variation
3. Campaign has run for at least 7 days (to capture weekly patterns)

### Common Misinterpretations — QA Should Check
- **Peeking problem:** Stopping the test early when significance first hits 95% inflates false positives. Test must reach minimum runtime.
- **Multiple goals:** Significance is calculated per goal. A variation can win on one goal and lose on another.
- **Novelty effect:** Conversion rate spike in first 48h is often due to returning visitors seeing something new. Filter by new visitors to check.

---

## Guide 3: Setting Up Heatmaps

### Recording Configuration
1. Go to Insights → Heatmaps → Create Heatmap
2. Enter target URL (exact match or substring)
3. Select device types to record
4. Set sample size (default: track all visitors; set a cap for high-traffic pages)
5. Activate

### Reading Heatmaps
- **Click Heatmap:** Red/yellow = most clicked areas. Check if users click non-clickable elements (indicates confusion).
- **Scroll Heatmap:** Shows % of visitors who scrolled to each depth. Content below the 50% scroll line is seen by fewer visitors.
- **Move Heatmap:** Mouse movement patterns. Often correlates with eye tracking for desktop users.

### QA Test Points for Heatmap Module
- Heatmap overlay does not appear until minimum 30 data points collected
- Click data updates in near-real-time (< 1 minute delay)
- Switching between device filters clears and reloads the heatmap
- Zoom in/out on heatmap preserves click positions correctly

---

## Guide 4: VWO SmartCode Installation

### What Is SmartCode
A JavaScript snippet added to every page of the website, in the `<head>` tag, that enables VWO to run experiments and collect data.

### Installation Steps
1. Settings → SmartCode → Copy snippet
2. Paste in `<head>` **before** any other scripts
3. Verify installation: VWO → Settings → SmartCode → Verify button

### Common Installation Issues — QA Checks
| Issue | Symptom | Fix |
|---|---|---|
| SmartCode not in head | Campaigns don't run; flickering on load | Move snippet to top of `<head>` |
| CSP blocking VWO | Console errors: "Refused to load script" | Add VWO domains to CSP whitelist |
| SPA not triggering | Campaigns run only on first page load | Use VWO's SPA integration (History API hook) |
| Async loading | Control flashes before variation applied | Use synchronous SmartCode snippet |

---

## Guide 5: Personalisation Campaigns

### Difference from A/B Tests
- No statistical significance or winner declaration
- Changes apply to 100% of matched segment (not split-tested)
- Used for targeted messaging: geo, device, UTM source, returning visitor

### Use Cases Tested at VWO
- Show "Welcome back" banner for returning visitors
- Show pricing in local currency based on geo (detected via IP)
- Change hero headline for visitors coming from Google Ads (UTM source = google / cpc)
- Hide signup CTA for logged-in users

### Segment Conditions Available
- **Device type:** Desktop / Mobile / Tablet
- **Location:** Country, Region, City
- **Browser:** Chrome, Firefox, Safari, Edge
- **Referrer:** URL contains/matches
- **Custom attribute:** JavaScript expression (e.g. `window.user.plan === 'free'`)
- **Cookie:** Cookie name + value match
