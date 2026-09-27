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
| EV-RT | V-D01, V-D04, V-D06 to V-D09, V-D11, V-D13, V-D16, V-D17, V-D20, V-D26, V-D29 | Captured output from a running stack, including the same request sent to the baseline and the fixed build | [EV-RT-runtime-verification.md](EV-RT-runtime-verification.md) |
| Test scripts | as above | The scripts that produced EV-RT, so the run can be repeated | `runtime_tests.js`, `container_checks.sh`, `socket_test.js`, `before_after.js`, `verify_k8s.py` |

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

- Cluster behaviour for the Kubernetes findings (V-D12, V-D21 to V-D24, V-D27).
  Those are verified as rendered manifests; TLS termination, the network
  policies and the database credentials have not been exercised in a cluster.
- End-to-end exploitation for V-D02, V-D03, V-D05, V-D14, V-D18 and V-D25.
  These are verified by build, by unit test or by inspecting the built bundle.
- Screenshots. The captures here are text; the video will need the visual
  equivalents, particularly for the consent control (V-D17).
