# Business Center Directus Setup

This frontend now uses these endpoint mappings:

- `business_requests` -> `requests`
- `business_export_jobs` -> `reports_exports`
- `business_message_invites` -> `request_invites`

No Directus collection renames are needed.

## Required Existing Collections

- `requests`
- `reports_exports`
- `request_invites`
- `business_profiles`
- `business_profile_members`
- `business_upgrade_requests`

## New Collections To Add

### `business_locations`

Fields:

- `id` (primary key)
- `org_id` (M2O -> `organizations.id`)
- `location_name` (string)
- `code` (string, optional)
- `city` (string, optional)
- `country` (string, optional)
- `address` (text, optional)
- `manager` (string, optional)
- `is_active` (boolean, default `true`)
- `date_created` (datetime, auto)

### `business_automation_rules`

Fields:

- `id` (primary key)
- `org_id` (M2O -> `organizations.id`)
- `rule_name` (string)
- `trigger` (string)
- `action` (string)
- `threshold` (integer/decimal, optional)
- `cooldown_minutes` (integer, optional)
- `is_active` (boolean, default `true`)
- `date_created` (datetime, auto)

### `business_invoices`

Fields:

- `id` (primary key)
- `org_id` (M2O -> `organizations.id`)
- `invoice_number` (string)
- `amount` (decimal)
- `currency` (string, default `USD`)
- `billing_cycle` (string)
- `due_date` (date or datetime)
- `status` (string)
- `payment_reference` (string, optional)
- `date_created` (datetime, auto)

## Access Policies (Role Used By Frontend)

Grant `Read`/`Create`/`Update` where needed:

- `requests` (`Read`, `Create`, `Update` if editing is enabled)
- `reports_exports` (`Read`, `Create`)
- `request_invites` (`Read`, `Create`)
- `business_locations` (`Read`, `Create`, `Update`)
- `business_automation_rules` (`Read`, `Create`, `Update`)
- `business_invoices` (`Read`)
- `business_profiles` (`Read`, `Create`, `Update`)
- `business_upgrade_requests` (`Read`, `Create`)

Apply org scoping filter on every org-owned collection:

- `org_id` equals current user's organization id.

Use your Directus policy variables/macros for current user context in the filter expression, based on your auth model.

## Frontend Behavior Notes

- Business Center service sends `org_id` when available.
- Loading states are finalized in all business sections and create-request flows.
- Error messages are categorized for:
  - network failures
  - `4xx` request errors
  - `5xx` server errors
