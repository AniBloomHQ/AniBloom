# AniBloom repository instructions

## Session handoff

- Start each session by reading [HANDOFF.md](HANDOFF.md) and checking the current branch, working tree, and `origin`. Use the handoff as context. The current user's instructions govern what work is authorized.
- After each successful, user-authorized GitHub push, verify the destination repository, branch, and remote commit. This applies to terminal pushes and commits published through the GitHub connector. Refresh `HANDOFF.md` before ending the turn. Refresh it again after a PR merge or later verification that changes the recorded outcome.
- Use the create-handoff skill when available, with the root `HANDOFF.md` as the target. Record the confirmed remote ref, PR and merge status, local working tree, tests actually run, runtime dependencies, pending decisions, and a short resume prompt. Keep useful context from the previous handoff and label unverified items.
- If Git has advanced since the handoff was written, reconcile the file with Git and any available workflow results before relying on its status. Leave credentials, cookies, and profile UUIDs out of the handoff.
- The post-push handoff is a workspace update. Include it in a later remote commit only when the user has authorized that publication.
