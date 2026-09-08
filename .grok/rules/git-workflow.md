# Git workflow

- Never commit on `main`. Never push to `main`.
- Never `--no-verify`. Never force-push a shared branch.
- Branch from `origin/main`. Prefer a worktree per task.
- Conventional Commits: `type(scope): subject`. Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`.
- Open PRs ready, not draft. Stack children target the parent branch.
- Squash-merge with `gh pr merge --squash` after the `CI` check is green.
