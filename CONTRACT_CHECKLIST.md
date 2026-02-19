# Contract Checklist

Use this checklist before importing the actor into StealthDock.

## File contract (repo root)

- [ ] `actor.yaml`
- [ ] `input.schema.json`
- [ ] `output.schema.json`
- [ ] `Dockerfile`
- [ ] `package-lock.json`
- [ ] `src/main.ts`
- [ ] `src/extract.ts`
- [ ] `src/pagination.ts`

Optional but included:

- [ ] `ui.schema.json`
- [ ] `example.input.json`
- [ ] `run.profile.json`

## `actor.yaml` contract

- [ ] `runtime: node`
- [ ] `engine_support` non-empty and only `playwright` / `camoufox`
- [ ] `version` semver (`x.y.z`)
- [ ] `entry` points to `src/main.ts`
- [ ] `schema_semver` set

## Schema contract

- [ ] `input.schema.json` is a JSON object
- [ ] `output.schema.json` is a JSON object
- [ ] `startUrls` is required in input schema
- [ ] Output schema matches emitted record fields
- [ ] UI metadata (`x-ui-section`, `x-ui-order`) present for form layout

## Runtime contract

- [ ] Uses internal runtime endpoints for bootstrap, queue, dataset, and events
- [ ] Handles ack/fail paths for each leased request
- [ ] Emits `engine.fallback` when Camoufox requested but unavailable
- [ ] Enforces `maxDepth`, `maxPages`, `maxResults`
- [ ] Fails invalid input early with explicit error message

## Smoke checklist

- [ ] `npm run test` passes
- [ ] `npm run smoke` passes
- [ ] `npm run start` launches without TypeScript/runtime errors

## Common failure signatures and fixes

- Import fails with `Actor contract missing required file(s)`:
  - Fix missing root files from file contract section.

- Import fails with `actor.yaml runtime must be 'node'`:
  - Set `runtime: node`.

- Import fails with lockfile error:
  - Run `npm install` and commit generated `package-lock.json` (lockfileVersion 2 or 3).

- Run fails with `Invalid input`:
  - Ensure required `startUrls` and valid types/ranges for numeric fields.

- Camoufox requested but warning fallback event appears:
  - Set `STEALTHDOCK_CAMOUFOX_ENABLED=1` if Camoufox runtime is expected to be available.

- Real runtime not executing actor image:
  - Verify `STEALTHDOCK_BUILD_REAL_MODE=1`, `STEALTHDOCK_REAL_ACTOR_RUNTIME=1`, and `STEALTHDOCK_EXECUTOR_REAL_MODE=1`.
