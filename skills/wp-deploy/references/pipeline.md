# Deployment pipeline

```yaml
# Deploy on tag; code only, database untouched.
- run: composer install --no-dev --optimize-autoloader
- run: npm ci && npm run build
- run: |
    rsync -az --delete \
      --exclude='wp-content/uploads' \
      --exclude='wp-config.php' \
      --exclude='.git' \
      ./ deploy@prod:/var/www/site/
- run: ssh deploy@prod 'cd /var/www/site && wp cache flush && wp rewrite flush'
```

`--delete` with `--exclude` on uploads and `wp-config.php` is the combination that makes rsync safe. Getting the excludes wrong deletes the media library.

For zero-downtime, deploy to a timestamped directory and switch a symlink; rollback is then switching it back.

Run database migrations — your own schema changes, not content — from an idempotent, version-gated routine. See `wp-plugin-architecture`, `references/rest-cron-tables.md`.
