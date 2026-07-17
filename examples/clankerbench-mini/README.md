# clankerbench-mini

This is a contract-only example for a generic benchmark provider.

It shows how a project can describe a staged benchmark harness without putting
project-specific implementation details into the benchmark contract.

Files:

- `clankerbench.manifest.json`: generic pipeline manifest
- `run-contract.json`: acceptance, promotion, and stop-condition contract
- `lane-ledger.md`: active-lane ledger for long-running optimization

The commands in the manifest are placeholders. A real provider would replace
`./bench ...` with project-local tools that emit JSON and write the declared
artifacts.
