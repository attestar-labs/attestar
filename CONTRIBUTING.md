# Contributing to attestar

`attestar` is part of the [attestar-labs](https://github.com/attestar-labs) organisation and is
developed in the open. Contributions of every size are welcome.

## Finding work

Open tasks are published as bounty issues on the issue tracker:

**-> https://github.com/attestar-labs/attestar/issues**

- Each issue title carries its bounty, for example `[Bounty: $60] Add unit tests for ...`.
- If you are new to the codebase, start with issues labelled `good first issue`.
- Comment on the issue before you begin so it can be assigned to you.

## Making the change

1. Fork the repository and branch from the default branch.
2. Keep the change scoped to the issue's acceptance criteria.
3. Run the existing test and lint commands before you commit.

If either verifying-key fixture changes, check that the browser JSON and contract
arrays still match. These checks use only Node.js; no dependencies or circuit build
are required, and the SDK CI job runs both on every pull request:

```sh
node .github/scripts/check-verifying-key.mjs
node --test .github/scripts/check-verifying-key.test.mjs
```

A mismatch reports the element (`alpha`, `beta`, `gamma`, `delta` or `ic[index]`)
and its first differing zero-based byte offset. Regenerate both fixtures from the
same verifying key if they drift.

## Opening a pull request

- Reference the issue in the description, for example `Closes #12`.
- One issue per pull request.
- Make sure CI passes before requesting review.

## Reporting a bug

Open an issue with steps to reproduce, the expected result and the actual result.

## Questions

Ask on the issue thread so the discussion stays alongside the task.
