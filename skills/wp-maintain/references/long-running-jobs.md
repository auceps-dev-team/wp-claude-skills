# Long-running jobs in WordPress

Backing up a site, restoring one, or scanning every file takes minutes. A PHP request gets seconds. Every serious WordPress tool has to solve this, and the solutions converge — which is what makes the pattern worth learning rather than reinventing.

Three plugins were read for this: WP Staging Pro 6.9.2, Duplicator Pro 4.6.9 and Wordfence 9.0.0. They use three different vocabularies for one architecture.

## Contents

- [The shared architecture](#the-shared-architecture)
- [Where each stops](#where-each-stops)
- [Persisting state](#persisting-state)
- [Driving the next request](#driving-the-next-request)
- [Applying it yourself](#applying-it-yourself)
- [What this means for a maintenance routine](#what-this-means-for-a-maintenance-routine)

## The shared architecture

Every one of them does the same four things:

1. Split the work into units that can be interrupted between any two of them
2. Loop over units while resources remain
3. Persist enough state to resume, before stopping
4. Trigger a fresh request that picks up where this one stopped

| Plugin | Vocabulary | Where it lives |
|---|---|---|
| WP Staging Pro | `isThreshold()` / Job / Task | `Framework/Traits/ResourceTrait.php`, `Backup/Job`, `Backup/Task` |
| Duplicator Pro | Chunking / `timeOut` / Persistance | `src/Libs/Chunking/ChunkingManager.php` |
| Wordfence | `forkIfNeeded()` / `fork()` | `lib/wfScanEngine.php` |

The loop shape is identical wherever you look:

```php
do {
    $this->processOneUnit();
} while ( ! $this->isThreshold() );
```

That exact line appears in WP Staging's database exporter, its background queue processor and its job preparer.

## Where each stops

This is the part people get wrong by guessing. **Stop well before the limit, not at it** — the last unit of work still has to finish, and state still has to be written.

WP Staging computes it explicitly:

```php
// Framework/Traits/ResourceTrait.php
$this->executionTimeLimit = max(
    min( $phpMaxExecutionTime - $executionTimeGapInSeconds, $phpMaxExecutionTime * 0.8 ),
    10
);
$this->scriptMemoryLimit = $this->getMaxMemoryLimit() * 0.8;
```

So: **80% of `max_execution_time`, minus a safety gap, with a floor of 10 seconds. 80% of the memory limit.** Both are checked; either one trips the stop.

```php
public function isThreshold() {
    if ( $this->isMemoryLimit() ) { return true; }
    if ( $this->isTimeLimit() )   { return true; }
    return false;
}
```

Checking memory as well as time matters more than it looks. A database export of wide rows exhausts memory long before it exhausts time, and a process killed by the memory limit leaves no chance to persist state — which is exactly the failure that produces a half-written backup.

Duplicator parameterises the same idea (`ChunkingManager` takes `$maxIteration`, `$timeOut` in microseconds, and `$throttling`), and Wordfence keeps `$maxExecTime` on the scan engine with the comment *"If more than $maxExecTime has elapsed since last check, fork a new scan process and continue"*.

## Persisting state

Whatever is needed to resume must survive the request ending. Wordfence takes the bluntest approach — it serializes the entire engine object:

```php
public function fork() {
    if ( wfConfig::set_ser( 'wfsd_engine', $this, true, wfConfig::DONT_AUTOLOAD ) ) {
        $this->scanController->flushSummaryItems();
        self::startScan( true, $this->scanMode );
    }
    exit( 0 );
}
```

Two details worth copying. `DONT_AUTOLOAD` keeps a large blob out of the alloptions cache — an autoloaded scan state would be unserialized on every request of every visitor. And the class declares `__sleep()` with an explicit property list, so what gets persisted is a deliberate decision rather than whatever happened to be on the object.

Duplicator separates this into a `Persistance/` namespace alongside `Iterators/`, so the iteration position is a first-class stored value.

The general rule: **persist the position, not the data.** Store "finished through row 40,000 of table X", not the rows themselves.

## Driving the next request

Three options, in order of reliability:

| Mechanism | Reliability | Cost |
|---|---|---|
| AJAX from an open browser tab | High while the tab is open | The user must stay |
| A self-firing HTTP request (`wp_remote_post` to `admin-ajax.php`, non-blocking) | Good | Needs loopback HTTP to work |
| WP-Cron | Poor on low-traffic sites | Free |

Wordfence's `fork()` starts a new scan request then calls `exit(0)` — the old process ends deliberately rather than lingering. That matters: two processes working the same queue corrupt each other's position.

Guard against that with a lock. WP Staging's queue processor holds one; a job that can run twice concurrently will produce a corrupted archive eventually.

## Applying it yourself

If you write anything that touches every post, every file or every row:

```php
function myplugin_process_batch() {
    $state  = get_option( 'myplugin_job_state', array( 'offset' => 0 ) );
    $limit  = (int) ini_get( 'max_execution_time' ) ?: 30;
    $budget = max( min( $limit - 5, $limit * 0.8 ), 10 );
    $memCap = myplugin_memory_limit_bytes() * 0.8;
    $start  = microtime( true );

    do {
        $done = myplugin_process_one( $state['offset'] );
        $state['offset'] += 1;

        if ( memory_get_usage( true ) > $memCap ) { break; }
    } while ( ! $done && ( microtime( true ) - $start ) < $budget );

    if ( $done ) {
        delete_option( 'myplugin_job_state' );
        return;
    }

    update_option( 'myplugin_job_state', $state, false );   // false: never autoload job state
    wp_remote_post( admin_url( 'admin-ajax.php' ), array(
        'blocking' => false,
        'timeout'  => 0.01,
        'body'     => array( 'action' => 'myplugin_continue', 'nonce' => wp_create_nonce( 'myplugin_job' ) ),
    ) );
}
```

Note `update_option( ..., false )` — the third argument disables autoloading. Job state that autoloads is job state unserialized on every page view for every visitor.

And the continuation endpoint is still an endpoint: it needs `check_ajax_referer()` and a capability check like any other. A resumable job whose continuation URL is publicly callable is a denial-of-service lever.

## What this means for a maintenance routine

Practical consequences when you are running backups rather than writing them:

- **A backup that "hangs at 60%" is usually the resume mechanism failing**, not the backup. Check whether loopback HTTP works on that host, and whether WP-Cron is disabled without a system cron replacing it.
- **Closing the browser tab can stop an AJAX-driven job.** Prefer tools that fall back to a server-side driver for anything large.
- **Shared hosts with a hard 30-second limit and 128MB memory** are exactly the environment these mechanisms exist for; a tool without one will never finish there.
- **A half-finished archive is worse than none**, because it looks like a backup. Verify the archive, not the progress bar — which is the same reason the restore test is the deliverable.
