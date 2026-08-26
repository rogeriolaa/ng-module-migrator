# ng-module-migrator

Analyze NgModule-based Angular apps and draft the standalone migration with a 100% local LLM.

`ng-module-migrator` walks your TypeScript sources, detects every `@NgModule({...})`, and produces a report plus an LLM-drafted migration: each declared component converted to `standalone: true` with its own `imports` array, and a new `bootstrapApplication()` `main.ts` for the bootstrap module. All inference runs locally (Qwen 2.5-Coder 1.5B via ONNX) — no code ever leaves your machine.

## How it works

- **Detection** is deterministic and regex/brace-matching based (`src/migrate.js`) — no heavy Angular compiler packages are needed to install or test. It extracts each module's `declarations`, `imports`, `exports`, and `bootstrap` arrays.
- **Drafting** hands each module to the shared local-LLM helper (`@qwen-lab/llm`, pointing at the local Qwen model) which outputs only the migrated code.
- **Tests** cover the pure functions with `node --test`; they never touch Angular packages or the model.

## Install

Requires Node.js ≥ 20 and pnpm:

```bash
npx pnpm install
```

## Usage

```bash
# Dry-run report + proposed output (default)
node index.js --path ./src/app

# Apply generated changes
node index.js --path ./src/app --write

# Portuguese explanations
node index.js --path src/app.module.ts --lang pt
```

Example output:

```
=== Standalone migration report ===

Modules found: 1
Declared components: 3
Estimated changes: 4

- src/app/app.module.ts → AppModule
  declarations: AppComponent, UsersComponent, HighlightPipe
  * bootstrap module → new main.ts with bootstrapApplication()

Running local LLM for AppModule...
--- proposed output ---
// app.component.ts
@Component({ standalone: true, ... })
...
```

## Options

| Option | Description |
| --- | --- |
| `--path <dir\|file>` | `.ts` file or directory to walk (**required**) |
| `--dry-run` | Print report only; do not write files (default) |
| `--write` | Write generated migration next to each module file |
| `--lang en\|pt` | Explanation language (default `en`) |

## Tests

```bash
npx pnpm test
```

## License

MIT © Rogerio Amorim
