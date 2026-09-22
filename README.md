# companion-module-talktome-intercom

Bitfocus Companion module for the talktome intercom server (`https://github.com/thepoison606/talktome`).

## Development

```bash
yarn install
yarn check
yarn build
yarn lint
yarn test
```

Smoke test against a local talktome app repo:

```bash
TALKTOME_REPO_ROOT=/path/to/talktome yarn smoke
```

## Module Notes

- Built with the official Companion TypeScript tooling stack
- Runtime entrypoint: `dist/main.js`
- User-facing Companion help lives in `companion/HELP.md`
