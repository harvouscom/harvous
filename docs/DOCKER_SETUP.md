# Docker Setup Guide

Detailed guide for setting up and configuring Harvous using Docker in self-hosted mode.

## Architecture

```
┌─────────────────┐
│   Harvous App   │
│   (Port 4321)   │
└────────┬────────┘
         │
         │ DATABASE_URL
         │
┌────────▼────────┐
│   PostgreSQL    │
│   (Port 5432)   │
└─────────────────┘
```

## Docker Compose Configuration

### Services

#### PostgreSQL Service

```yaml
postgres:
  image: postgres:16-alpine
  environment:
    POSTGRES_USER: harvous
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    POSTGRES_DB: harvous
  volumes:
    - postgres_data:/var/lib/postgresql/data
  ports:
    - "5432:5432"
```

**Key Features:**
- Alpine-based image (smaller size)
- Persistent data volume
- Health checks enabled
- Auto-initialization from schema file

#### Application Service

```yaml
app:
  build:
    context: .
    dockerfile: Dockerfile
  environment:
    SELF_HOSTED: "true"
    DATABASE_URL: postgresql://harvous:password@postgres:5432/harvous
  depends_on:
    postgres:
      condition: service_healthy
```

**Key Features:**
- Multi-stage build (optimized image size)
- Waits for PostgreSQL to be ready
- Automatic restart on failure

## Dockerfile Stages

### 1. Base Stage
- Node.js 20 Alpine base image
- Minimal OS footprint

### 2. Dependencies Stage
- Installs npm dependencies
- Cached layer for faster rebuilds

### 3. Builder Stage
- Copies source code
- Runs build process
- Sets `SELF_HOSTED=true`

### 4. Runner Stage
- Production-optimized image
- Only includes necessary files
- Runs as non-root user

## Volumes

### Persistent Data

```yaml
volumes:
  postgres_data:
    driver: local
  app_data:
    driver: local
```

**postgres_data**: Database files and schema
**app_data**: Application data (if needed)

## Environment Variables

### Required

- `SELF_HOSTED=true` - Enables self-hosted mode
- `DATABASE_URL` - PostgreSQL connection string

### Optional

- `POSTGRES_PASSWORD` - Database password (default: `changeme`)
- `INIT_DB` - Auto-initialize database (default: `false`)
- `PORT` - Application port (default: `4321`)
- `NODE_ENV` - Environment (default: `production`)

## Network Configuration

Docker Compose creates a default network where:
- Services can communicate by service name
- `postgres` hostname resolves to PostgreSQL container
- `app` hostname resolves to application container

## Health Checks

PostgreSQL health check:
```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U harvous"]
  interval: 10s
  timeout: 5s
  retries: 5
```

This ensures the app only starts after PostgreSQL is ready.

## Building

### Development Build

```bash
docker-compose build
```

### Production Build

```bash
docker-compose build --no-cache
```

### Build Specific Service

```bash
docker-compose build app
```

## Running

### Start Services

```bash
docker-compose up -d
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f postgres
```

### Stop Services

```bash
docker-compose down
```

### Stop and Remove Volumes

```bash
docker-compose down -v
```

## Database Initialization

### Manual Initialization

```bash
docker-compose exec app npm run db:init-postgres
```

### Automatic Initialization

Set `INIT_DB=true` in `.env` and the entrypoint script will initialize on startup.

### Schema File

The schema is automatically loaded from `db/postgres-schema.sql` when the PostgreSQL container first starts (via `/docker-entrypoint-initdb.d/`).

## Customization

### Change Ports

Edit `docker-compose.yml`:

```yaml
services:
  app:
    ports:
      - "8080:4321"  # Host:Container
  postgres:
    ports:
      - "5433:5432"  # Host:Container
```

### Change Database Password

1. Update `.env`:
   ```bash
   POSTGRES_PASSWORD=your_secure_password
   ```

2. Update `DATABASE_URL`:
   ```bash
   DATABASE_URL=postgresql://harvous:your_secure_password@postgres:5432/harvous
   ```

3. Restart services:
   ```bash
   docker-compose down -v
   docker-compose up -d
   ```

### Add Custom Environment Variables

Edit `docker-compose.yml`:

```yaml
services:
  app:
    environment:
      CUSTOM_VAR: value
```

## Troubleshooting

### Container Won't Start

1. Check logs: `docker-compose logs app`
2. Verify environment variables
3. Check port availability: `lsof -i :4321`

### Database Connection Issues

1. Verify PostgreSQL is running: `docker-compose ps`
2. Check connection string format
3. Test connection: `docker-compose exec postgres psql -U harvous harvous`

### Build Failures

1. Clear Docker cache: `docker system prune -a`
2. Rebuild without cache: `docker-compose build --no-cache`
3. Check Node.js version compatibility

### Permission Issues

The application runs as user `harvous` (UID 1001). If you need to access files:
```bash
docker-compose exec app ls -la
```

## Production Considerations

### Security

1. **Change default passwords**
2. **Use secrets management** (Docker secrets, Vault, etc.)
3. **Enable SSL/TLS** for database connections
4. **Restrict network access** with firewall rules
5. **Regular security updates**

### Performance

1. **Resource limits**:
   ```yaml
   services:
     app:
       deploy:
         resources:
           limits:
             cpus: '2'
             memory: 2G
   ```

2. **Database optimization**: Tune PostgreSQL settings
3. **Connection pooling**: Configure appropriate pool sizes

### Monitoring

1. **Health checks**: Use Docker health checks
2. **Logging**: Configure log aggregation
3. **Metrics**: Add monitoring tools (Prometheus, etc.)

### Backup Strategy

1. **Automated backups**: Schedule regular database dumps
2. **Volume backups**: Backup Docker volumes
3. **Off-site storage**: Store backups remotely

## Advanced Configuration

### Custom Entrypoint

Create `docker/entrypoint.sh` and modify `Dockerfile`:

```dockerfile
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
```

### Multi-Environment Setup

Create separate compose files:
- `docker-compose.dev.yml`
- `docker-compose.prod.yml`

Use with: `docker-compose -f docker-compose.yml -f docker-compose.prod.yml up`

### External PostgreSQL

To use an external PostgreSQL instance:

1. Remove `postgres` service from `docker-compose.yml`
2. Update `DATABASE_URL` to point to external database
3. Ensure network connectivity

## Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Astro Documentation](https://docs.astro.build/)

