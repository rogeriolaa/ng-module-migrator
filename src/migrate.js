/**
 * Pure analysis helpers for ng-module-migrator.
 *
 * Detection is regex/brace-matching based — no Angular compiler packages are
 * required, so the deterministic core is fast to install and trivially testable.
 */

/** Extract balanced `{...}` block starting right after `fromIndex`. */
function extractBraceBlock(code, fromIndex) {
  const start = code.indexOf("{", fromIndex);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") {
      depth--;
      if (depth === 0) return code.slice(start + 1, i);
    }
  }
  return null;
}

/** Parse a TS array literal like `[ A, B, C ]` into trimmed entries. */
export function parseArrayLiteral(text) {
  if (!text) return [];
  const inner = text.replace(/^\s*\[/, "").replace(/\]\s*$/, "");
  return inner
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Extract a top-level metadata property named `key` from an object body. */
function extractProperty(body, key) {
  const re = new RegExp(`\\b${key}\\s*:\\s*\\[`, "g");
  const m = re.exec(body);
  if (!m) return [];
  // Start AFTER the opening bracket — it must not be counted twice.
  let depth = 1;
  for (let i = m.index + m[0].length; i < body.length; i++) {
    if (body[i] === "[") depth++;
    else if (body[i] === "]") {
      depth--;
      if (depth === 0) return parseArrayLiteral(body.slice(m.index + m[0].length - 1, i + 1));
    }
  }
  return [];
}

/** Extract the class name of a decorated class whose decorator ends near `decoratorEnd`. */
function classNameAfter(code, decoratorEnd) {
  const m = /class\s+([A-Za-z_$][\w$]*)/.exec(code.slice(decoratorEnd, decoratorEnd + 200));
  return m ? m[1] : null;
}

/**
 * Analyze TypeScript source for @NgModule decorated classes.
 * Returns an array of module infos:
 * { name, className, declarations, imports, exports, bootstrap }
 */
export function analyzeNgModule(code) {
  if (typeof code !== "string" || !code.trim()) return [];
  const results = [];
  const re = /@NgModule\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    // find closing paren of the decorator call
    let depth = 0;
    let end = -1;
    for (let i = m.index + m[0].length - 1; i < code.length; i++) {
      if (code[i] === "(") depth++;
      else if (code[i] === ")") {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end === -1) continue;
    results.push({
      name: classNameAfter(code, end),
      className: classNameAfter(code, end),
      declarations: extractProperty(code.slice(m.index, end), "declarations"),
      imports: extractProperty(code.slice(m.index, end), "imports"),
      exports: extractProperty(code.slice(m.index, end), "exports"),
      bootstrap: extractProperty(code.slice(m.index, end), "bootstrap"),
    });
  }
  return results;
}

const STANDALONE_RE = /standalone\s*:\s*true/;

/**
 * Given declarations entries (identifiers or file paths), list those that do NOT
 * already declare `standalone: true` in the provided source snippets map.
 * `sourcesByEntry` maps declaration entry -> source code of that component file.
 */
export function findStandaloneCandidates(declarations, sourcesByEntry = {}) {
  if (!Array.isArray(declarations)) return [];
  return declarations.filter((entry) => {
    const src = sourcesByEntry[entry];
    if (src === undefined) return true; // unknown source: assume candidate
    return !STANDALONE_RE.test(src);
  });
}

/**
 * Build chat messages asking the local LLM to output ONLY migrated code.
 * moduleInfo: result of analyzeNgModule()[i]; sourcesByEntry optional map of
 * component sources so the model can add real imports arrays.
 */
export function buildMigrationPrompt(moduleInfo, sourcesByEntry = {}) {
  if (!moduleInfo || typeof moduleInfo !== "object") {
    throw new TypeError("moduleInfo must be an object from analyzeNgModule()");
  }
  const declSources = (moduleInfo.declarations || [])
    .map((d) => {
      const src = sourcesByEntry[d];
      return src ? `\n// ${d} current source:\n${src}` : `\n// ${d}: source not provided`;
    })
    .join("\n");

  const isBootstrap = (moduleInfo.bootstrap || []).length > 0;

  const system =
    "You are an expert in Angular standalone components. Output ONLY code, no explanations, no markdown fences.";

  const user = `Migrate this NgModule to the standalone components API.

Module: ${moduleInfo.className}
declarations: ${(moduleInfo.declarations || []).join(", ") || "(none)"}
imports: ${(moduleInfo.imports || []).join(", ") || "(none)"}
exports: ${(moduleInfo.exports || []).join(", ") || "(none)"}
bootstrap: ${(moduleInfo.bootstrap || []).join(", ") || "(none)"}
${declSources}

Requirements:
- Each component/directive/pipe gets standalone: true.
- Each standalone component declares its own imports array listing the directives/pipes it actually uses.
- Remove the NgModule entirely.${isBootstrap ? "\n- Also output a new main.ts using bootstrapApplication() for the root component." : ""}
- Output each migrated file as: // filename.ts followed by its full code.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
