# Picker Wheel

A static picker wheel with local saved items and JSON import/export. No application framework, build step, or backend is required.

## Run

Open [index.html](index.html) directly, or serve it locally with Node.js 22 or newer:

```sh
npm ci
npm start
```

The local server listens at http://127.0.0.1:4173. Saved lists are local to the browser and origin, so opening the file directly and serving it over HTTP can use different storage.

For Docker:

```sh
docker compose up --build -d
```

Open http://localhost:8080. The container runs unprivileged with a read-only filesystem.

## Item Files

Import replaces the current list only after the entire file passes validation. Export produces this format:

```json
[
  { "name": "Pizza", "enabled": true },
  { "name": "Sushi", "enabled": false }
]
```

- Up to 100 items and a 64 KiB import file.
- Names are trimmed and must contain 1-40 UTF-16 code units, matching the input's HTML length limit.
- `enabled` must be a JSON boolean, not a string or number.
- An empty array is valid. Empty or fully disabled lists cannot spin.
- Invalid imports leave the current list untouched. Invalid saved data falls back to defaults.
- Editing and spinning are locked while a file is loading; editing stays locked during a spin.
- Dense wheel labels are shortened or omitted when space is insufficient. The item list always retains full names.

The winner dialog supports keyboard dismissal and restores focus to Spin. Reduced-motion preferences skip the spin animation and confetti.

## Tests

```sh
npm ci
npx playwright install chromium --only-shell
npm test
```

Playwright checks desktop and mobile Chromium layouts, winner alignment, spin/import locking, keyboard focus, reduced motion, persistence, import/export validation, and canvas rendering. Screenshots and failure traces are written under `test-results/`.

CI runs these tests before building, smoke-testing, and publishing the Docker image.