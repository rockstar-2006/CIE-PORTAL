// ═══════════════════════════════════════════════════════════
//  Dart / Flutter Autocomplete Symbols & Dynamic Scraper
// ═══════════════════════════════════════════════════════════

const DART_KEYWORDS = [
  'abstract', 'as', 'assert', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'covariant', 'default', 'deferred', 'do', 'dynamic', 'else', 'enum', 'export', 'extends', 'extension',
  'external', 'factory', 'false', 'final', 'finally', 'for', 'function', 'get', 'hide', 'if', 'implements',
  'import', 'in', 'interface', 'is', 'late', 'library', 'mixin', 'new', 'null', 'on', 'operator', 'part',
  'rethrow', 'return', 'set', 'show', 'static', 'super', 'switch', 'sync', 'this', 'throw', 'true', 'try',
  'typedef', 'var', 'void', 'while', 'with', 'yield'
];

const FLUTTER_WIDGETS = [
  'AppBar', 'Column', 'Container', 'ElevatedButton', 'Icon', 'Image', 'ListView', 'MaterialApp', 
  'Padding', 'Row', 'Scaffold', 'SizedBox', 'Stack', 'StatefulWidget', 'StatelessWidget', 'Text', 
  'TextField', 'Theme', 'Center', 'Expanded', 'Padding'
];

/**
 * Scans the student's code to find their own classes, variables, and functions.
 * This is the "Dynamic" (not hardcoded) part.
 */
function getDynamicSymbols(model, monaco, range) {
  const code = model.getValue();
  const symbols = [];
  const Kind = monaco.languages.CompletionItemKind;

  // 1. Find Classes: class MyClass { ... }
  const classMatches = code.matchAll(/\bclass\s+([A-Z]\w*)/g);
  for (const match of classMatches) {
    symbols.push({
      label: match[1],
      kind: Kind.Class,
      insertText: match[1],
      detail: 'Defined Class',
      range
    });
  }

  // 2. Find Functions: void myFunc() { ... }
  const funcMatches = code.matchAll(/\b(?:void|int|String|Double|bool|Widget)\s+([a-z]\w*)\s*\(/g);
  for (const match of funcMatches) {
    symbols.push({
      label: match[1],
      kind: Kind.Function,
      insertText: `${match[1]}()`,
      detail: 'Defined Function',
      range
    });
  }

  // 3. Find Variables: var myVar = ... or final myVar = ...
  const varMatches = code.matchAll(/\b(?:var|final|const|int|String|bool|auto)\s+([a-z]\w*)\s*[=;]/g);
  for (const match of varMatches) {
    symbols.push({
      label: match[1],
      kind: Kind.Variable,
      insertText: match[1],
      detail: 'Local Variable',
      range
    });
  }

  return symbols;
}

/**
 * MAIN PROVIDER
 */
export function getDartCompletions(monaco, model, position) {
  const word = model.getWordUntilPosition(position);
  const range = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn
  };

  const completions = [];
  const Kind = monaco.languages.CompletionItemKind;

  // A. Add DYNAMIC symbols (Class/Fun/Var defined by the student)
  completions.push(...getDynamicSymbols(model, monaco, range));

  // B. Add Standard Keywords
  DART_KEYWORDS.forEach(kw => {
    completions.push({
      label: kw,
      kind: Kind.Keyword,
      insertText: kw,
      range
    });
  });

  // C. Add Common Flutter Widgets
  FLUTTER_WIDGETS.forEach(w => {
    completions.push({
      label: w,
      kind: Kind.Class,
      insertText: w,
      range
    });
  });

  // D. Important Boilerplate Snippets
  const Rules = monaco.languages.CompletionItemInsertTextRule;
  const snippet = (label, insert, doc) => ({
    label,
    kind: Kind.Snippet,
    insertText: insert,
    insertTextRules: Rules.InsertAsSnippet,
    documentation: doc,
    range
  });

  completions.push(
    snippet('Scaffold', "Scaffold(\n  appBar: AppBar(title: Text('${1:Title}')),\n  body: ${2:Center(child: Text('Hello'))},\n)", 'Full Page Scaffold'),
    snippet('setState', "setState(() {\n  ${1:// update values}\n});", 'Rebuild UI')
  );

  return completions;
}
