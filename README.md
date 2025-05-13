# Harvous

A note-taking and thread management application.

## Database Synchronization

This project uses Astro DB with a remote database for production. To ensure your database stays in sync between local and production environments, please follow these guidelines:

### Automatic Synchronization

The following automated processes help keep your databases in sync:

1. **Pre-Deploy Check**: Database schema is automatically pushed before deployment via `npm run predeploy`
2. **Git Hooks**: Running `npm run precommit` before committing changes will check for database schema changes
3. **CI/CD Pipeline**: The GitHub workflow in `.github/workflows/db-sync.yml` verifies and pushes schema changes

### Manual Synchronization

If you need to manually sync your database:

```bash
# Push local schema to remote database
npm run db:push

# Check for schema changes
npm run db:check

# For local development
npm run db:sync
```

### Troubleshooting

If you encounter HTTP 500 errors after deployment, it might be due to database schema mismatches. Run:

```bash
npm run db:push
```

Then redeploy your application.

[Figma Designs](https://www.figma.com/design/xRe02cHax8dHZml5fAoDdS/Harvous?node-id=10095-1656&p=f&t=DrDxfHIMGx7g6FAE-0)