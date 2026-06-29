# Wellar Workspaces Directus Endpoint

Standalone Directus 11.14.x endpoint for Angular web onboarding.

It creates a new company/workspace for the authenticated user only:

`POST /wellar/workspaces/create`

It does not use or depend on `google-mobile-exchange`.

## Security Contract

- Requires a valid Directus session/JWT.
- Uses only `req.accountability.user`.
- Rejects frontend-sent `user_id`, `role`, owner flags, workspace ids, business profile ids, and membership ids.
- Creates `business_profiles`, `business_profile_members`, and `activity_events` in one transaction.
- Rejects any user who already has a `business_profile_members` row.
- Grants `owner` only on the newly created `business_profiles` row.
- On successful new self-service workspace creation only, atomically sets `directus_users.role`, `active_business_profile`, `active_department`, and `active_member_role`.
- Leaves `directus_users.role` unchanged for workspace switching and self-owned idempotent recovery.

## Request Body

```json
{
  "idempotency_key": "uuid-or-random-client-key",
  "company_name": "Acme Inc",
  "contact_name": "Jane Owner",
  "work_email": "jane@acme.example",
  "phone": "+1 555 0100",
  "industry": "Operations",
  "team_size": 25,
  "country": "US",
  "city": "Austin",
  "website": "https://acme.example",
  "timezone": "America/Chicago",
  "default_language": "en"
}
```

Only `idempotency_key` and `company_name` are required.

## Required Environment

`WELLAR_OWNER_ROLE_ID` is required and must be set to the Directus global Owner role UUID that new self-service company creators should receive.

Directus must have:

- `EXTENSIONS_PATH` configured or using the default `./extensions`.
- `WELLAR_OWNER_ROLE_ID=<directus_roles.id for the production Owner role>`.
- `activity_events`, `business_profiles`, `business_profile_members`, and `directus_users` tables available.
- `directus_roles` table available with the configured Owner role row present.
- PostgreSQL database, because this endpoint uses `pg_advisory_xact_lock`.

## Required Directus Admin Step

In Directus Data Model, edit `activity_events.action` and add `workspace_created` as a selectable choice. The endpoint writes `action = "workspace_created"` and `entity_type = "company"`.

## Easypanel Deployment

Run these commands in the Easypanel terminal for the Directus service.

First identify the persistent extensions path:

```sh
printenv EXTENSIONS_PATH
pwd
ls -la
find / -maxdepth 4 -type d -name extensions 2>/dev/null | head -20
```

If `EXTENSIONS_PATH` is empty, Directus defaults to `./extensions` relative to the Directus working directory.

Copy the package into a temporary build location:

```sh
mkdir -p /tmp/wellar-workspaces
# Copy this repository folder into /tmp/wellar-workspaces by upload, git pull, or paste.
cd /tmp/wellar-workspaces
npm install
npm run build
```

Install into Directus extensions:

```sh
EXT_PATH="${EXTENSIONS_PATH:-./extensions}"
mkdir -p "$EXT_PATH/endpoints/wellar"
cp -R package.json dist "$EXT_PATH/endpoints/wellar/"
ls -la "$EXT_PATH/endpoints/wellar"
```

Restart Directus from Easypanel. If `EXTENSIONS_AUTO_RELOAD=true` is enabled, a restart may not be required, but restart is the production-safe option.

Confirm it is visible in Directus Settings -> Extensions as endpoint `wellar`.

## Production Test

Use a real authenticated web user token that does not already have a membership:

```sh
export DIRECTUS_URL="https://dash.conntinuity.com"
export USER_TOKEN="PASTE_REAL_USER_JWT"
export IDEMPOTENCY_KEY="$(date +%s)-manual-test"

curl -i -X POST "$DIRECTUS_URL/wellar/workspaces/create" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"idempotency_key\": \"$IDEMPOTENCY_KEY\",
    \"company_name\": \"Manual Test Company\",
    \"contact_name\": \"Manual Tester\",
    \"work_email\": \"manual@example.com\",
    \"phone\": \"not-provided\",
    \"country\": \"US\"
  }"
```

Expected success: HTTP `201` with `data.workspace.id` and `data.membership.memberRole = "owner"`.

Expected retry for an already-created self-owned workspace: HTTP `200` with the same `data.workspace` and `data.membership` shape.

Expected request from a user who belongs to another workspace: HTTP `409`.

## Rollback

```sh
EXT_PATH="${EXTENSIONS_PATH:-./extensions}"
rm -rf "$EXT_PATH/endpoints/wellar"
```

Restart Directus from Easypanel.

Rollback data from a failed manual test only if required, and only after confirming ids:

```sql
-- Prefer restoring from backup. Manual cleanup must remove dependent rows first.
delete from activity_events where action = 'workspace_created' and entity_id = '<business_profile_id>';
delete from business_profile_members where business_profile = '<business_profile_id>';
update directus_users
set active_business_profile = null, active_department = null, active_member_role = null
where active_business_profile = '<business_profile_id>';
delete from business_profiles where id = '<business_profile_id>';
```

## Verify Persistence Across Redeployments

In Easypanel, inspect the Directus service volumes/mounts.

Terminal checks:

```sh
printenv EXTENSIONS_PATH
EXT_PATH="${EXTENSIONS_PATH:-./extensions}"
touch "$EXT_PATH/.wellar-persistence-check"
ls -la "$EXT_PATH/.wellar-persistence-check"
```

Redeploy or restart the Directus service, then run:

```sh
EXT_PATH="${EXTENSIONS_PATH:-./extensions}"
ls -la "$EXT_PATH/.wellar-persistence-check"
ls -la "$EXT_PATH/endpoints/wellar"
```

If `.wellar-persistence-check` or `endpoints/wellar` disappears after redeploy, the extensions directory is not mounted to persistent storage. Configure an Easypanel volume for the Directus extensions path before production use.
