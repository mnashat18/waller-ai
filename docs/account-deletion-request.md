# Wellar Account Deletion Request Flow

## Public Web Route

- `https://app.conntinuity.com/delete-account`

## Directus Endpoint

- `POST /wellar/account-deletion-requests`

## Required Environment

- `ACCOUNT_DELETION_RECIPIENT_EMAIL`
- Directus SMTP and MailService must be configured for outbound mail delivery.

## Behavior

- The public page collects the account email, an optional reason, and an explicit confirmation checkbox.
- The Directus endpoint validates the request and emails staff.
- Staff must verify identity before deleting any user or associated data.
- No automatic direct deletion occurs in source.
- Deletion requests should be reviewed for memberships, organizations, scans, reports, notifications, subscriptions, audit data, and legal retention obligations before any manual action.

## Deployment

- The Directus extension must be deployed.
- The Web application must be deployed.
- The Web URL must be entered in Google Play Console as the account deletion URL.
