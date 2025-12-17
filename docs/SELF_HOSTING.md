# Self-Hosting Guide

This guide explains how to run Harvous in self-hosted mode using Docker. Self-hosted mode removes all SaaS dependencies (PostHog analytics, Clerk authentication, Turso database) and uses PostgreSQL instead.

## Overview

Self-hosted mode provides:
- **No authentication required** - Single-user mode
- **PostgreSQL database** - Full control over your data
- **No analytics tracking** - Complete privacy
- **Docker deployment** - Easy setup and management

## Prerequisites

- Docker and Docker Compose installed
- At least 2GB of available RAM
- Basic knowledge of Docker and command line

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/harvouscom/harvous.git
   cd harvous
   ```

2. **Set up environment variables**
   ```bash
   cp env-template-self-hosted.txt .env
   # Edit .env and set your PostgreSQL password
   ```

3. **Start the services**
   ```bash
   docker-compose up -d
   ```

4. **Initialize the database** (first time only)
   ```bash
   docker-compose exec app npm run db:init-postgres
   ```

5. **Access the application**
   Open http://localhost:4321 in your browser

## Configuration

### Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Required
SELF_HOSTED=true
DATABASE_URL=postgresql://harvous:your_password@postgres:5432/harvous

# Optional
POSTGRES_PASSWORD=your_secure_password
INIT_DB=false
PORT=4321
```

### Database Connection

The `DATABASE_URL` format is:
```
postgresql://username:password@host:port/database
```

For Docker Compose, use:
```
postgresql://harvous:your_password@postgres:5432/harvous
```

## Docker Services

### PostgreSQL

- **Image**: `postgres:16-alpine`
- **Port**: `5432` (exposed to host)
- **Data**: Persisted in `postgres_data` volume
- **Health Check**: Automatic readiness check

### Application

- **Port**: `4321` (exposed to host)
- **Build**: Multi-stage Docker build
- **Dependencies**: Automatically waits for PostgreSQL

## Database Management

### Initialize Database

On first run, initialize the database schema:

```bash
docker-compose exec app npm run db:init-postgres
```

Or set `INIT_DB=true` in your `.env` file to auto-initialize on startup.

### Backup Database

```bash
docker-compose exec postgres pg_dump -U harvous harvous > backup.sql
```

### Restore Database

```bash
docker-compose exec -T postgres psql -U harvous harvous < backup.sql
```

### Access PostgreSQL CLI

```bash
docker-compose exec postgres psql -U harvous harvous
```

## Updating

1. **Pull latest changes**
   ```bash
   git pull
   ```

2. **Rebuild and restart**
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

3. **Run migrations** (if needed)
   ```bash
   docker-compose exec app npm run db:init-postgres
   ```

## Troubleshooting

### Database Connection Errors

- Check that PostgreSQL container is running: `docker-compose ps`
- Verify `DATABASE_URL` in `.env` matches Docker Compose configuration
- Check PostgreSQL logs: `docker-compose logs postgres`

### Application Won't Start

- Check application logs: `docker-compose logs app`
- Verify all environment variables are set correctly
- Ensure PostgreSQL is healthy: `docker-compose ps`

### Port Already in Use

- Change the port in `docker-compose.yml`:
  ```yaml
  ports:
    - "4322:4321"  # Use different host port
  ```

### Reset Everything

```bash
docker-compose down -v  # Removes volumes
docker-compose up -d
docker-compose exec app npm run db:init-postgres
```

## Differences from SaaS Version

### Removed Features

- **Authentication**: No sign-in/sign-up required
- **Analytics**: No PostHog tracking
- **Multi-user**: Single-user mode only

### Database

- Uses PostgreSQL instead of Turso/Astro DB
- All `userId` columns set to `'self-hosted'`
- Full SQL access for custom queries

### Build Process

- Uses `build:self-hosted` script
- Excludes Clerk and Astro DB integrations
- Requires `SELF_HOSTED=true` environment variable

## Security Considerations

1. **Change default passwords** - Update `POSTGRES_PASSWORD` in `.env`
2. **Firewall rules** - Don't expose ports to public internet without proper security
3. **Regular backups** - Set up automated database backups
4. **Updates** - Keep Docker images and application updated

## Support

For issues specific to self-hosting:
- Check the [Docker Setup Guide](./DOCKER_SETUP.md)
- Review application logs: `docker-compose logs app`
- Check database logs: `docker-compose logs postgres`

## Next Steps

- [Docker Setup Guide](./DOCKER_SETUP.md) - Detailed Docker configuration
- [Architecture Documentation](./ARCHITECTURE.md) - Understanding the codebase
- [README](../README.md) - General project information

