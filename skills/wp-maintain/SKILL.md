---
name: wp-maintain
description: Keep a live WordPress site healthy — backup strategy and verified restores, update management and staged rollouts, uptime and error monitoring, malware and integrity checking, log review, database hygiene, and periodic health audits. Use this whenever setting up backups or testing a restore, planning or applying updates to a live site, investigating whether a site is compromised, setting up monitoring or alerting, or running a scheduled maintenance review.
---

# Maintaining a live WordPress site

Maintenance is the longest phase of a site's life and the one where incidents happen. It is also the phase most often sold as a monthly fee and delivered as "we clicked update".

Two facts shape everything here. **An untested backup is not a backup** — the only evidence you have one is a restore you performed. And **most compromises arrive through an outdated third-party plugin**, not through the theme you wrote, so update discipline *is* security work.

## When to use

- Setting up backups, or verifying that existing ones restore
- Planning or applying updates to a live site
- Investigating whether a site has been compromised
- Setting up uptime, error or integrity monitoring
- Running a periodic health review

## When NOT to use

- **Auditing theme or plugin source for vulnerabilities** → `wp-security-audit`
- **Moving a site between environments, or a one-off migration** → `wp-deploy`
- **A slow site with no availability problem** → `wp-performance`
- **Server hardening, permissions, headers** → `wp-security-audit`, `references/hardening.md`

## Required inputs

| Input | Why |
|---|---|
| Hosting type and access (SSH? WP-CLI? panel only?) | Decides which of the tools below are even available |
| Where backups currently go, and when one was last restored | "We have backups" is not an answer |
| Traffic profile and acceptable downtime | Sets the update strategy |
| Whether a staging environment exists | Without one, updates are tested in production |
| Who else has administrator access | Every admin is an attack path |

## Backups

### What must be captured

A WordPress site is **database + uploads + code**, and they must be consistent with each other. A database dump taken an hour after the files describes a site that never existed.

| Component | Changes | Typical schedule |
|---|---|---|
| Database | Constantly | Daily, hourly for a shop |
| `wp-content/uploads` | On publish | Daily, incremental |
| Themes and plugins | On update | Weekly, or from git |
| `wp-config.php`, server config | Rarely | On change |

Keep them **off the server being backed up**. A backup in `wp-content/backups` is destroyed by the same ransomware, the same disk failure and the same accidental `rm -rf` as the site.

Retention that survives real incidents: daily for a week, weekly for a month, monthly for a year. A compromise discovered three weeks in needs a restore point from before it.

### The restore test is the deliverable

```bash
# Quarterly, on a throwaway environment
wp db export pre-test.sql
wp db import backup-2026-08-01.sql
wp search-replace 'https://live.example.com' 'https://restore-test.local' --all-tables --precise
wp cache flush && wp rewrite flush
# then actually look: front page, a permalink, an admin screen, a form, a builder layout
```

Write down the **time it took**. A four-hour restore is a fact the client needs before an outage, not during one.

## Updates

The trade-off is real: updating breaks things, not updating gets you compromised. Not updating loses, but the process matters.

**Order:** security releases immediately; WordPress minor versions promptly (they are point fixes and auto-update by default); plugins weekly in a batch; WordPress major versions and PHP after testing.

```bash
wp plugin list --update=available --fields=name,version,update_version
wp plugin update --all --dry-run

wp db export pre-update-$(date +%F-%H%M).sql     # rollback point first
wp plugin update --all
wp core update-db
wp cache flush
```

Then **look at the site**. An update that fatals is obvious; one that silently breaks a checkout is not.

Two settings worth knowing. `WP_AUTO_UPDATE_CORE = 'minor'` is the right default. And plugin auto-updates are appropriate for well-maintained plugins on a site with backups — the risk of an unattended update is usually lower than the risk of a month-old vulnerability.

What actually predicts risk is not the version number but **maintenance status**: last-updated date, active installs, whether the author responds to support. A plugin last updated three years ago is a liability whatever its version.

## Monitoring

Three things need watching, and they fail differently:

**Uptime** — external HTTP check every 5 minutes against a real page, not `/`. Cache can serve a working homepage while the database is down.

**Errors** — `WP_DEBUG_LOG` to a path outside the web root, reviewed rather than accumulated. A log nobody reads is disk usage.

**Integrity** — core files should be byte-identical to the release:

```bash
wp core verify-checksums
```

That one command is the fastest compromise check available, and it belongs in every maintenance routine.

## Compromise triage

Signs, in rough order of reliability: unexpected administrator accounts, modified core files, unknown files in `uploads/`, outbound spam, injected content visible only to search-engine user agents, and a sudden traffic pattern change.

```bash
wp core verify-checksums
wp user list --role=administrator --fields=ID,user_login,user_email,user_registered
find wp-content/uploads -name '*.php'          # there should be none
node .../wp-scan.mjs wp-content/themes/active-theme --min-severity high
```

If compromised: take the site offline or behind maintenance, preserve a forensic copy **before** cleaning, rotate all credentials and salts, then restore from a known-good backup rather than trying to clean in place. Cleaning in place leaves what you did not find.

## The maintenance report

Clients pay for this monthly, so it needs to state what was actually verified:

```markdown
## <site> — maintenance, <month>

**Updates applied:** core, N plugins (list anything with a behaviour change)
**Backups:** N taken, last verified restore <date>, restore time <duration>
**Uptime:** N% — incidents and causes
**Integrity:** core checksums pass/fail, admin accounts unchanged
**Attention needed:** abandoned plugins, PHP version, expiring certificates
```

The line that earns the fee is the verified restore. Everything else is visible in a dashboard.

## Reference files

The depth lives alongside this file. Read the one that matches the task rather than all of them:

| File | Covers |
|---|---|
| [`references/long-running-jobs.md`](references/long-running-jobs.md) | How backup, restore and scan tools survive PHP timeouts — the resumable-job architecture, measured across three professional plugins |
