# GitHub records review: public-release preparation

## Result

**The read-only review is complete; approved cleanup is now complete.** Historical notes and attachments remain in Git history because the owner explicitly declined history rewriting and subsequently approved making them public with the existing history retained. No remote records were deleted during the initial review. Later approved operations are recorded below.

This review covers authenticated, read-only GitHub API inventories and Actions log scans for `nmdra/notes`. Counts describe the review snapshot, not future runs. At the review snapshot, the local hardening changes were uncommitted and had not changed the remote publication workflow.

## Coverage and findings

| Surface | Coverage | Result |
| --- | --- | --- |
| Visibility | Repository metadata | Private at review time; prior visibility was not established |
| Branches | All 4 listed branches | `v5` plus 3 Dependabot branches; local history scan had covered only `v5` |
| Tags | Complete inventory | 0 |
| Workflow runs and logs | All 70 listed runs; all log archives readable | 48 runs matched sync/publish-report and vault/path indicators; 53 matched vault/path indicators overall |
| Credential-shaped log values | Pattern scan of all 70 log archives | No matches; this is not a guarantee that every possible secret format is absent |
| Actions artifacts | Complete metadata inventory | 0; no artifact payload existed to inspect |
| Actions caches | Metadata inventory | 1 cache entry; payload not inspected |
| Issues/PR records | 3 open Dependabot PRs and 2 comments on PR #3 | Scanned 5 body/comment fields; no sync-report or credential-shaped matches; 13 path/vault indicator matches; no attachment URLs matched |
| PR review comments | All 3 PRs | 0 |
| Releases and release assets | Complete release inventory | 0 releases |
| Forks | Repository fork inventory | 0 listed |
| Discussions and wiki | Repository feature metadata | Disabled |
| Default-branch commits | Commit inventory | 57; historical content removal was not performed |
| Deployment configuration | Variable and secret names only | No repository Actions variables listed; `REPO_KEY` secret exists. Its value, repository scope, and expiry cannot be established from this name inventory |

All paginated inventory requests completed without GitHub request errors. Log contents, unpublished target paths, and note bodies are intentionally omitted from this report.

### Interpretation

The log scan identifies publication-report and private-metadata indicators, not confirmed note-body disclosure in each run. Repository identifiers and runner paths can produce matches. The existing sync implementation prints blocked/unpublished reference names, so retained publication logs require approval or removal before public conversion.

GitHub states that Actions history and logs become public when repository visibility changes. A later safe logging change does not sanitize stored runs. The remote workflow can continue to produce old-style logs until the local fixes are committed and pushed. Do not publish this repository based only on the absence of credential-shaped matches.

## Workflow runs flagged for disposition

The following 48 runs matched report-related plus vault/path indicators. URLs have the form `https://github.com/nmdra/notes/actions/runs/<ID>`.

```text
39325411460 38798047059 38320416121 37846624574
37701123264 37451769996 37433283896 37384792271
37283443506 37150092940 36926836858 36677139826
36675631711 36490940879 36459802645 36323833577
36323627896 36304873933 36303659052 36253123316
36239249768 36237946637 36237801731 36237577971
36236134085 36235166429 36223838568 36221932494
36221394265 36220306063 36214917002 36212541677
36210943289 36173637676 36170979249 36170480938
36167508434 36164610104 36161342803 36156889514
36147776585 36141631155 36137536091 36136517427
36131580129 36129763677 36129232332 36127979040
```

## Approved cleanup and release sequence

The owner approved deleting all 70 existing Actions runs, retaining the cache, setting the source-repository variable, and making the repository public after committing/pushing the fixes and verifying CI. The owner explicitly accepted retention of historical content in the publication confirmation.

Completed operations:

- Deleted all 70 approved, completed workflow runs. Post-deletion inventory returned 0 runs and 0 artifacts.
- Preserved the original Actions cache. The cache count remains 1 and its ID is unchanged.
- Set `VAULT_REPOSITORY` to the source repository already used by the remote deployment workflow. No secret values were retrieved or changed.
- Re-ran local validation: 33 Python tests and 188 Quartz tests passed; TypeScript, Ruff, formatting, and diff checks passed.

Next: commit and push the reviewed current-file fixes, verify the resulting CI run, then change visibility as explicitly approved. Stop before visibility conversion if CI fails. New CI records are separate from the 70 deleted historical runs.

## Release checklist from the initial review

1. Obtain explicit approval to delete affected workflow runs or all existing workflow runs. Deleting artifacts alone does not remove retained logs, and there are no artifacts currently listed. Re-inventory immediately before and after any approved deletion.
2. Decide whether to retain or remove the single Actions cache. Its payload was not reviewed; no deletion is authorized by this report.
3. Set `VAULT_REPOSITORY` before deploying the updated workflow. It is a repository variable, not a secret, and checkout logs may show its value. Keep `REPO_KEY` limited to read access on the source repository and inspect its scope/expiry in the credential owner's settings.
4. Resolve historical exposure without assuming latest-tree deletion removes it. The owner declined rewriting history. Either explicitly approve the old contents for publication or publish a separate sanitized snapshot repository while leaving this repository private.
5. Complete actual site-content review and repository protection checks from [the release plan](public-release.md). Those checks were not substituted by this hosted-record audit.

## Limits

No log bodies, private vault source, cached build payloads, binary note attachments, or generated-site payloads were written into this report. No source vault checkout or site build was run. The review did not establish past visibility, inspect deleted/expired records, certify arbitrary personal information in free text, or prove that copies do not exist outside GitHub. The initial review performed no writes. Subsequent user-approved deletion of old runs and variable configuration are recorded above. No history rewrite or force-push is authorized. Cache contents, historical notes/attachments, and the existing commit metadata have not been sanitized by these operations.

## Evidence sources

- Authenticated `gh api` inventories under `repos/nmdra/notes`: repository metadata, branches, tags, Actions runs/logs/artifacts/caches, issues and comments, pull requests and review comments, releases, forks, and default-branch commits.
- `gh variable list --repo nmdra/notes --json name` and `gh secret list --repo nmdra/notes --json name`: names only, no values retrieved.
- [GitHub visibility documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).
