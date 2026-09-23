# Evidence index (AI, telemedicine and infrastructure)

Evidence for the V-D findings in the SE4030 report. Each entry states what kind
of evidence it is, because the kinds carry different weight: a source excerpt
shows that the weakness is in the code, a fix commit shows what changed, and a
captured request and response shows the weakness actually being exploited and
then refused. Only the first two exist so far.

| Evidence ID | Finding | Type | Where |
| :--- | :--- | :--- | :--- |
| EV-D01 to EV-D29 | V-D01 to V-D29 | Baseline source excerpt at commit `37a6612` | [EV-D-baseline-source.md](EV-D-baseline-source.md) |
| EV-D14 | V-D14 | `npm audit --json` output, baseline and current, per package | [EV-D14-npm-audit.json](EV-D14-npm-audit.json) |
| Fix commits | V-D01 to V-D29 | Code change, one commit per finding | `git log 37a6612..` on branch `Nivakaran`, hashes cited per finding in the report |
| EV-RT-D01 onward | V-D01 to V-D29 | Runtime request and response, before and after the fix | **Not captured yet.** To be produced when the stack is run, and filed in Appendix B |

## How to reproduce

Source excerpts, which are quoted verbatim in `EV-D-baseline-source.md`:

```
git show 37a6612:<path>
```

Dependency audit, where the baseline figures come from the lockfiles at the
baseline commit, extracted into a temporary directory and audited there:

```
npm audit --json
```

The fix for any finding:

```
git show <fix commit>
```

## What is still missing

Runtime evidence. For each finding that will be demonstrated in the report or
the video, capture the request and the response against the baseline build, then
the same request against the modified build, and file both under Appendix B with
the matching EV-RT identifier. Note the build hash and the date on each capture.
Keep all captures to synthetic accounts and records.
