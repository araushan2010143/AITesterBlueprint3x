# VWO Entity Relationship Diagram — Data Model

## Core Entities

### Account
| Field | Type | Notes |
|---|---|---|
| account_id | UUID (PK) | Unique identifier |
| name | VARCHAR(255) | Company/team name |
| plan | ENUM | Free, Growth, Business, Enterprise |
| created_at | TIMESTAMP | Account creation date |
| owner_id | UUID (FK → User) | Primary account owner |

### User
| Field | Type | Notes |
|---|---|---|
| user_id | UUID (PK) | |
| account_id | UUID (FK → Account) | Parent account |
| email | VARCHAR(255) UNIQUE | Login credential |
| role | ENUM | Admin, Editor, Viewer |
| last_login | TIMESTAMP | |
| two_fa_enabled | BOOLEAN | Default false |

### Campaign
| Field | Type | Notes |
|---|---|---|
| campaign_id | UUID (PK) | |
| account_id | UUID (FK → Account) | |
| name | VARCHAR(255) | Campaign display name |
| type | ENUM | ab_test, split_url, mvt, personalisation |
| status | ENUM | draft, running, paused, won, archived |
| traffic_percentage | INT | 0–100% sent to experiment |
| start_date | TIMESTAMP | |
| end_date | TIMESTAMP | Null = no end date |
| created_by | UUID (FK → User) | |

### Variation
| Field | Type | Notes |
|---|---|---|
| variation_id | UUID (PK) | |
| campaign_id | UUID (FK → Campaign) | |
| name | VARCHAR(100) | e.g. "Control", "Variation-1" |
| traffic_split | DECIMAL(5,2) | Percentage of campaign traffic |
| changes | JSONB | Visual editor diff stored as JSON |
| is_control | BOOLEAN | True for the baseline variation |

### Goal
| Field | Type | Notes |
|---|---|---|
| goal_id | UUID (PK) | |
| campaign_id | UUID (FK → Campaign) | |
| name | VARCHAR(255) | e.g. "Button Click", "Revenue" |
| type | ENUM | click, page_visit, revenue, custom_event |
| selector | VARCHAR(512) | CSS selector for click goals |
| url_pattern | VARCHAR(512) | For page visit goals |
| is_primary | BOOLEAN | One primary goal per campaign |

### Visitor
| Field | Type | Notes |
|---|---|---|
| visitor_id | UUID (PK) | Hashed/anonymous identifier |
| account_id | UUID (FK → Account) | |
| first_seen | TIMESTAMP | |
| device | ENUM | desktop, tablet, mobile |
| browser | VARCHAR(50) | Chrome, Firefox, Safari, Edge |
| country | CHAR(2) | ISO country code |

### Impression
| Field | Type | Notes |
|---|---|---|
| impression_id | UUID (PK) | |
| campaign_id | UUID (FK → Campaign) | |
| variation_id | UUID (FK → Variation) | Which variation was shown |
| visitor_id | UUID (FK → Visitor) | |
| timestamp | TIMESTAMP | When visitor was bucketed |

### Conversion
| Field | Type | Notes |
|---|---|---|
| conversion_id | UUID (PK) | |
| goal_id | UUID (FK → Goal) | |
| visitor_id | UUID (FK → Visitor) | |
| campaign_id | UUID (FK → Campaign) | |
| variation_id | UUID (FK → Variation) | |
| timestamp | TIMESTAMP | |
| revenue | DECIMAL(10,2) | Null unless goal type = revenue |

---

## Relationships

```
Account ──< User           (one account, many users)
Account ──< Campaign       (one account, many campaigns)
Campaign ──< Variation     (one campaign, 2-5 variations)
Campaign ──< Goal          (one campaign, many goals)
Campaign ──< Impression    (one campaign, many impressions)
Variation ──< Impression   (one variation seen by many visitors)
Visitor ──< Impression     (one visitor, many impressions across campaigns)
Visitor ──< Conversion     (one visitor, many conversions)
Goal ──< Conversion        (one goal, many conversions)
```

---

## Key Constraints for QA

- A visitor can be bucketed into only **one variation per campaign** (enforced by unique index on campaign_id + visitor_id in Impression table)
- Traffic split across all variations in a campaign must sum to **100%**
- A campaign must have **exactly one primary goal** (is_primary = true)
- Conversion requires a prior Impression for the same visitor + campaign combination
- Archived campaigns retain all data but cannot be restarted
