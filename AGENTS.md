# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the extension code, split by runtime: `src/content/` for the GitHub page scraper, `src/background/` for the service worker, `src/popup/` for the popup UI, `src/core/` for shared parsing/formatting logic, and `src/shared/` for cross-entry message types. Static extension assets live in `public/`, with the manifest at `public/manifest.json`. Tests live in `tests/`; HTML fixtures used by parser coverage are in `tests/fixtures/`. Build output is generated in `dist/` and should not be edited manually.

## Build, Test, and Development Commands
Run `npm install` once to install dependencies. Use `npm run build` to create a production extension bundle in `dist/`. Use `npm run dev` to rebuild on file changes while developing. Run `npm run typecheck` to validate TypeScript types with no emit. Run `npm test` for the full Vitest suite, or `npm run test:watch` for local iteration.

## Coding Style & Naming Conventions
This repository uses TypeScript with ES modules, two-space indentation, semicolons, and single quotes. Prefer small named exports over default exports. Keep shared domain logic in `src/core/` and browser-entry wiring in `src/content/`, `src/popup/`, or `src/background/`. Use descriptive camelCase for variables/functions, PascalCase for interfaces and types, and kebab-case or role-based names for top-level files such as `service-worker.ts`. Match existing test names like `parser.unit.test.ts` and `fixture.integration.test.ts`.

## Testing Guidelines
Vitest runs in a `jsdom` environment, so DOM-facing code should be covered with focused unit tests. Add or update fixture-based integration tests when GitHub DOM parsing changes. Keep fixtures under `tests/fixtures/` and name tests by behavior, not implementation. Do not surface resolved review-thread comments; parser changes should preserve that rule and include coverage for it. Before opening a PR, run `npm run typecheck` and `npm test`; CI runs both on every pull request.

## Commit & Pull Request Guidelines
Recent history favors short, imperative commit subjects such as `Add fixtures`, `Code refactoring`, and `Update README with example screens`. Keep commits focused and easy to scan. PRs should include a brief summary, testing notes, and screenshots when popup UI or extracted output changes. Link the relevant issue when one exists, and note any fixture updates or GitHub DOM assumptions reviewers should verify.

Use semantic versioning for extension releases. Whenever a change includes a feature or bug fix, bump the extension version in both `package.json` and `public/manifest.json` as part of the same work. Prefer patch bumps for fixes, minor bumps for backward-compatible features, and major bumps for breaking changes.

## Extension Notes
After `npm run build`, load `dist/` through `chrome://extensions` or `brave://extensions` using **Load unpacked**. If parser behavior changes, verify the extension against a real GitHub pull request page in addition to automated tests.
