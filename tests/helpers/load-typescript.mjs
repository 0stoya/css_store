// Unit-test loader: compile trusted repository source with the installed dev dependency.
// All application IO must be explicitly supplied; this is not a Next/Magento runtime.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

export default function loadTypeScript(root, relativePath, imports = {}) {
  const fileName = path.join(root, relativePath);
  const result = ts.transpileModule(fs.readFileSync(fileName, "utf8"), {
    fileName,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const errors = (result.diagnostics || []).filter((entry) => entry.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: (name) => name, getCurrentDirectory: () => root, getNewLine: () => "\n",
  }));
  const module = { exports: {} };
  vm.runInNewContext(result.outputText, {
    module, exports: module.exports, FormData, URLSearchParams,
    require: (name) => {
      if (Object.hasOwn(imports, name)) return imports[name];
      throw new Error(`Unmocked dependency: ${name}`);
    },
  }, { filename: fileName });
  return module.exports;
}
