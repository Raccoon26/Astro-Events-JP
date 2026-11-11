# Development contract

Work only in this repository. Read REQUIREMENTS.md, PROJECT_STATUS.md and the applicable DEV_ROADMAP.md entry before each DEV. Do not start the next DEV without the user.

Use E:/Astro-Events-JP/repo on Windows. Source scripts/environment.ps1 before package/tool operations. Do not fall back to C/D. Cloud runners must explicitly identify themselves and never claim E-drive validation. Cleanup defaults to Dry Run; only owned, unchanged E temporary files are eligible for deletion. Never delete through links.

At completion: review all changes, audit requirement coverage and regressions, run npm run check, update documents/status, commit on the requested DEV branch, push, create/update a main PR, wait for all required CI and approvals, repair failures, and enable Auto Merge or merge safely with an expected head SHA. Verify merge and fetch latest main. No force push, protection bypass/removal, test deletion to hide failures, branch deletion, or overwriting others' work. If blocked, retain PR and record exact evidence and user action. See GITHUB_WORKFLOW.md and RELEASE_CHECKLIST.md.
