# Database Migrations

This directory contains versioned SQL migration files for the HAsync database.

## Quick Start

```bash
# Check status
npm run migrate:status

# Run migrations
npm run migrate:run

# Create new migration
npm run migrate:create "your migration name"
```

## Current Migrations

1. **001_initial_schema.sql** - Core tables (clients, pairing_sessions, activity_log, entity_cache, configuration)
2. **002_add_areas.sql** - Areas table for entity organization
3. **003_add_auth_tables.sql** - User authentication and GDPR compliance tables
4. **004_add_gdpr_columns.sql** - Add GDPR compliance columns (created_by)

## File Naming

Format: `<version>_<description>.sql`

- Version: 3-digit zero-padded number (001, 002, 003...)
- Description: Snake_case description
- Extension: `.sql`

Examples:
- `005_add_user_settings.sql`
- `006_create_notifications_table.sql`

## Rules

1. **Idempotent**: Use `IF NOT EXISTS` / `IF EXISTS`
2. **Forward-only**: Never modify applied migrations
3. **One feature per migration**: Keep related changes together
4. **Test first**: Run on test database before committing

## Template

Use `TEMPLATE.sql` as a starting point, or run:

```bash
npm run migrate:create "migration name"
```

## Documentation

For detailed documentation, see `/docs/MIGRATIONS.md`
