# VWO Figma Design Specifications — UI Components

## Design System Overview

VWO uses a unified design system called **VWO Design System (VDS)**. All UI components are defined in Figma and implemented in React. QA must validate components against Figma specs for visual accuracy, accessibility, and interaction behavior.

---

## Authentication Screens

### Login Page
- **URL:** `/login`
- **Components:** Email input, Password input (masked), "Remember me" checkbox, "Forgot Password" link, "Sign In" CTA button
- **Figma Spec:** Email field placeholder: "Enter your email address". Password field: toggle visibility icon (eye icon). CTA: solid blue `#1F6FEB`, full width on mobile.
- **Validation Points:** Error state shows inline red text below field. Empty submit shows "Email is required" and "Password is required". Successful login redirects to `/dashboard`.

### Forgot Password Page
- **URL:** `/forgot-password`
- **Components:** Email input, "Send Reset Link" button, back to login link
- **Figma Spec:** Success state shows green banner "Reset link sent to your email". Error state for unregistered email shows "No account found with this email."

### Sign Up Page
- **URL:** `/signup`
- **Components:** Name, Email, Password, Company Name inputs; Terms checkbox; "Create Account" CTA
- **Figma Spec:** Password strength indicator (Weak / Fair / Strong) appears as user types. Minimum 8 characters. At least 1 number required.

---

## Dashboard

### Main Navigation (Sidebar)
- **Components:** VWO logo, nav items (Campaigns, Reports, Heatmaps, Session Recordings, Funnels, Settings), account avatar + dropdown
- **Figma Spec:** Active nav item has left border `#1F6FEB` (4px), background `#EBF3FF`. Collapsed sidebar on mobile (<768px) becomes bottom tab bar.
- **Validation Points:** Nav links are keyboard-accessible (Tab + Enter). Active route highlighted matches URL.

### Campaign List
- **Components:** Campaign name, Status badge (Running / Paused / Draft / Archived / Won), Traffic split %, Goal metric, Start date, Action menu (Edit / Pause / Archive / Duplicate)
- **Figma Spec:** Status badge colors — Running: green `#16A34A` bg `#F0FDF4`; Paused: yellow `#CA8A04` bg `#FEF9C3`; Draft: grey; Won: blue.
- **Validation Points:** Clicking campaign name opens detail page. Action menu items fire confirmation modal for destructive actions.

---

## Campaign Creation Flow

### Step 1 — Campaign Type Selection
- **Options:** A/B Test, Split URL Test, Multivariate Test, Personalisation
- **Figma Spec:** Card grid layout, icon + label + short description per option. Selected card gets blue border `#1F6FEB`.

### Step 2 — Goal Configuration
- **Components:** Goal type dropdown (Click, Page Visit, Revenue, Custom Event), element selector (CSS picker), goal name input
- **Figma Spec:** CSS picker opens overlay with highlight tool. Selected element shown in green border on live page preview.

### Step 3 — Variation Builder
- **Components:** Visual editor toolbar, element tree panel, CSS editor panel, preview (desktop / tablet / mobile toggle)
- **Figma Spec:** Toolbar icons: Move, Select, Text, Image, HTML, Undo, Redo. Panel width 280px, resizable.
- **Validation Points:** Undo/Redo (Ctrl+Z / Ctrl+Y) works on last 50 changes. Preview toggles update canvas width only (not reload).

### Step 4 — Traffic & Targeting
- **Components:** Traffic split sliders per variation, audience segment selector, URL targeting rules
- **Figma Spec:** Sliders are linked (total must equal 100%). "Equal split" quick button resets to equal distribution.

---

## Heatmap Module

### Heatmap View
- **Components:** Page URL input, date range picker, device filter (Desktop / Mobile / Tablet), heatmap overlay (click / move / scroll tabs), legend gradient (blue → green → yellow → red)
- **Validation Points:** Toggle between Click, Move, Scroll heatmaps without page reload. Scroll heatmap shows % of visitors who scrolled to each depth.

---

## Reports Module

### Campaign Report
- **Components:** Winner banner, Conversion rate chart (line), Statistical significance indicator, Variation comparison table, Goal selector dropdown
- **Figma Spec:** Winner banner background `#F0FDF4`, border `#16A34A`, crown icon. Significance shown as progress bar toward 95% threshold.
- **Validation Points:** Goal dropdown change updates chart data without page reload. Chart tooltips show sample size + conversion rate on hover.

---

## Settings Module

### Account Settings
- **Sections:** Profile (Name, Email, Avatar), Password Change, Two-Factor Authentication, Notification Preferences, API Keys
- **Figma Spec:** Avatar upload: drag-and-drop or click, accepts JPG/PNG max 2MB, shows crop modal.

### Integrations Page
- **Components:** Integration cards (Google Analytics, Segment, Mixpanel, HubSpot, Salesforce, Slack), status indicator (Connected / Not Connected), Connect / Disconnect button
- **Validation Points:** Connect opens OAuth popup. Disconnect shows confirmation modal. Status polling updates every 30s.

---

## Component States — Accessibility & Interaction

| Component | States to Test |
|---|---|
| Button | Default, Hover, Focus (ring), Active (pressed), Loading (spinner), Disabled |
| Input | Default, Focus (blue border), Filled, Error (red border + message), Disabled |
| Dropdown | Closed, Open, Option hover, Option selected, Multi-select with chips |
| Modal | Open (backdrop blur), Close (X button + ESC key + backdrop click) |
| Toast | Success (green), Error (red), Warning (yellow) — auto-dismiss 5s |
| Table | Empty state, Loading skeleton, Pagination, Sort asc/desc, Row hover |

---

## Responsive Breakpoints

| Breakpoint | Width | Layout Change |
|---|---|---|
| Mobile | < 768px | Sidebar collapses, tables scroll horizontally, modals full-screen |
| Tablet | 768px – 1024px | Sidebar icon-only, 2-column grid |
| Desktop | > 1024px | Full sidebar, 3-column grid, all panels visible |
