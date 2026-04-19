// ═══════════════════════════════════════════════════════════
//  Dart Linting Rules
//  Used by Monaco Editor's setModelMarkers API
//  Add new rules here without touching cie.js
// ═══════════════════════════════════════════════════════════

/**
 * Each rule is an object:
 * {
 *   test: (line, trimmed, monacoInstance) => boolean | number (col offset)
 *   message: string
 *   severity: 'Error' | 'Warning' | 'Info' | 'Hint'
 *   getCol?: (line) => number   // 1-based start column (optional)
 *   getEndCol?: (line) => number // 1-based end column (optional)
 * }
 */
export const DART_LINT_RULES = [

  // ── Wrong capitalisation ───────────────────────────────────
  {
    id: 'wrong-print-case',
    test: (line) => /\bPrint\s*\(/.test(line),
    getCol: (line) => line.indexOf('Print') + 1,
    getEndCol: (line) => line.indexOf('Print') + 6,
    message: "❌ 'Print' is not defined in Dart. The built-in output function is lowercase: print('...')",
    severity: 'Error',
  },
  {
    id: 'wrong-void-case',
    test: (line) => /\bVoid\b/.test(line),
    getCol: (line) => line.indexOf('Void') + 1,
    getEndCol: (line) => line.indexOf('Void') + 5,
    message: "❌ 'Void' is not valid. Dart uses lowercase 'void' for return types.",
    severity: 'Error',
  },
  {
    id: 'wrong-null-case',
    test: (line) => /\bNull\b/.test(line) && !/NullPointerException/.test(line),
    getCol: (line) => line.indexOf('Null') + 1,
    getEndCol: (line) => line.indexOf('Null') + 5,
    message: "❌ 'Null' (capital N) is not a Dart keyword. Use lowercase 'null'.",
    severity: 'Error',
  },
  {
    id: 'wrong-true-false-case',
    test: (line) => /\bTrue\b|\bFalse\b/.test(line),
    getCol: (line) => (line.indexOf('True') !== -1 ? line.indexOf('True') : line.indexOf('False')) + 1,
    getEndCol: (line) => (line.indexOf('True') !== -1 ? line.indexOf('True') + 5 : line.indexOf('False') + 6),
    message: "❌ Boolean literals in Dart are lowercase: 'true' and 'false'.",
    severity: 'Error',
  },

  // ── Type mismatches ────────────────────────────────────────
  {
    id: 'int-assigned-string',
    test: (line) => /\bint\s+\w+\s*=\s*"/.test(line) || /\bint\s+\w+\s*=\s*'/.test(line),
    getCol: () => 1,
    getEndCol: (line) => line.length + 1,
    message: "⚠️ Type mismatch: You are assigning a String value to an 'int' variable. Use a number without quotes (e.g., int x = 5;).",
    severity: 'Error',
  },
  {
    id: 'bool-assigned-int',
    test: (line) => /\bbool\s+\w+\s*=\s*[01];/.test(line),
    getCol: () => 1,
    getEndCol: (line) => line.length + 1,
    message: "⚠️ Dart booleans are 'true' or 'false', not 0 or 1. Fix: bool x = true;",
    severity: 'Warning',
  },

  // ── Other language habits ──────────────────────────────────
  {
    id: 'console-log',
    test: (line) => /console\.log/.test(line),
    getCol: (line) => line.indexOf('console') + 1,
    getEndCol: (line) => line.indexOf('console') + 12,
    message: "💡 'console.log' is JavaScript, not Dart. In Dart, use print('...'). Example: print('Hello');",
    severity: 'Error',
  },
  {
    id: 'system-out-println',
    test: (line) => /System\.out\.println/.test(line),
    getCol: (line) => line.indexOf('System') + 1,
    getEndCol: (line) => line.indexOf('System') + 21,
    message: "💡 'System.out.println' is Java syntax. In Dart, use print('...'). Example: print('Hello');",
    severity: 'Error',
  },
  {
    id: 'printf-c-style',
    test: (line) => /\bprintf\s*\(/.test(line),
    getCol: (line) => line.indexOf('printf') + 1,
    getEndCol: (line) => line.indexOf('printf') + 7,
    message: "💡 'printf' is C/C++ syntax. In Dart, use print('...'). Example: print('Hello');",
    severity: 'Error',
  },
  {
    id: 'cout-cpp-style',
    test: (line) => /\bcout\s*<</.test(line),
    getCol: (line) => line.indexOf('cout') + 1,
    getEndCol: (line) => line.indexOf('cout') + 5,
    message: "💡 'cout' is C++ syntax. In Dart, use print('...'). Example: print('Hello');",
    severity: 'Error',
  },

  // ── Missing semicolons ─────────────────────────────────────
  {
    id: 'missing-semicolon',
    test: (line, trimmed) =>
      trimmed.length > 0 &&
      !trimmed.endsWith('{') &&
      !trimmed.endsWith('}') &&
      !trimmed.endsWith(',') &&
      !trimmed.endsWith(';') &&
      !trimmed.endsWith(')') &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('/*') &&
      !trimmed.startsWith('*') &&
      !trimmed.startsWith('@') &&
      !trimmed.startsWith('import') &&
      !trimmed.startsWith('class') &&
      !trimmed.startsWith('void ') &&
      !trimmed.startsWith('Widget ') &&
      !trimmed.startsWith('Future ') &&
      !trimmed.startsWith('Stream ') &&
      !trimmed.startsWith('if ') &&
      !trimmed.startsWith('else') &&
      !trimmed.startsWith('for ') &&
      !trimmed.startsWith('while ') &&
      !trimmed.startsWith('switch ') &&
      !trimmed.startsWith('return') &&
      trimmed.includes('=') &&
      !trimmed.includes('=>'),
    getCol: (line) => line.length,
    getEndCol: (line) => line.length + 1,
    message: "⚠️ Possible missing semicolon ';' at end of statement. Dart requires semicolons to terminate variable assignments and expressions.",
    severity: 'Warning',
  },

  // ── var / final best practices ─────────────────────────────
  {
    id: 'var-no-init',
    test: (line, trimmed) => /^\s*var\s+\w+\s*;/.test(line),
    getCol: () => 1,
    getEndCol: (line) => line.length + 1,
    message: "⚠️ Variable declared with 'var' but not initialized. In Dart, this defaults to 'null'. Consider using a specific type or providing an initial value.",
    severity: 'Warning',
  },

  // ── Widget struct issues ───────────────────────────────────
  {
    id: 'new-keyword',
    test: (line) => /\bnew\s+[A-Z]/.test(line),
    getCol: (line) => line.indexOf('new') + 1,
    getEndCol: (line) => line.indexOf('new') + 4,
    message: "💡 The 'new' keyword is unnecessary in Dart 2+. Remove it. Example: use Container() instead of new Container().",
    severity: 'Hint',
  },
];

export function runDartLinter(code, monaco, model, program = null) {
  if (!code || !monaco || !model) return;
  const markers = [];
  const lines = code.split('\n');

  // 2. Global Syntax Audit (Brackets, Quotes)
  const syntaxMarkers = checkGlobalSyntax(code, monaco);
  markers.push(...syntaxMarkers);

  // 3. Scope Intelligence (Dynamic - Not Hardcoded)
  // Finds undefined variables, classes, and functions
  const scopeMarkers = checkScopeErrors(code, monaco);
  markers.push(...scopeMarkers);

  // 4. Program relevance check
  if (program) {
    const relevanceMarker = checkProgramRelevance(code, program, monaco);
    if (relevanceMarker) markers.unshift(relevanceMarker); // show at top
  }

  monaco.editor.setModelMarkers(model, 'dart-linter', markers);
}

/**
 * DYNAMIC SCOPE CHECKER
 * Scans for declarations and flags usage of undefined identifiers.
 */
function checkScopeErrors(code, monaco) {
  const markers = [];
  const lines = code.split('\n');
  
  // 1. Extract every word that looks like a variable/class declaration
  const declaredNames = new Set([
     'print', 'runApp', 'void', 'main', 'int', 'double', 'String', 'bool', 'var', 'final', 'const',
     'Scaffold', 'AppBar', 'Text', 'Center', 'Column', 'Row', 'Container', 'SizedBox', 'Icon', 'Icons',
     'Colors', 'MaterialApp', 'ThemeData', 'StatefulWidget', 'StatelessWidget', 'State', 'Widget',
     'BuildContext', 'ElevatedButton', 'ListView', 'Stack', 'Padding', 'Expanded', 'Align', 'Theme',
     'MediaQuery', 'Navigator', 'context', 'super', 'this', 'override', 'key', 'index', 'item'
  ]);

  // Find user-declared names (classes, functions, vars)
  const userDecls = code.matchAll(/\b(?:class|void|var|final|int|String|bool)\s+([a-z0-9_]+)/gi);
  for (const match of userDecls) {
    declaredNames.add(match[1].trim());
  }

  // 2. Scan for usage of words that aren't declared
  lines.forEach((line, i) => {
    // Ignore imports and comments
    if (line.trim().startsWith('import') || line.trim().startsWith('//')) return;

    // Find all standalone words (potential identifiers)
    const words = line.matchAll(/\b([a-z][a-z0-9_]*)\b/gi);
    for (const match of words) {
        const foundWord = match[1];
        const col = match.index + 1;

        // If the word isn't in our "Defined" set, it's an error
        if (!declaredNames.has(foundWord)) {
            markers.push({
                startLineNumber: i + 1, startColumn: col, endLineNumber: i + 1, endColumn: col + foundWord.length,
                message: `❌ Undefined name '${foundWord}'. Try declaring it first or check your spelling.`,
                severity: monaco.MarkerSeverity.Error, source: 'Scope Intelligence'
            });
        }
    }
  });

  return markers;
}

/**
 * Validates whole-file syntax like balanced brackets and quotes.
 */
function checkGlobalSyntax(code, monaco) {
    const markers = [];
    const stack = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '{' || char === '(' || char === '[') {
                stack.push({ char, line: i + 1, col: j + 1 });
            } else if (char === '}' || char === ')' || char === ']') {
                const last = stack.pop();
                if (!last || (char === '}' && last.char !== '{') || (char === ')' && last.char !== '(') || (char === ']' && last.char !== '[')) {
                    markers.push({
                        startLineNumber: i + 1, startColumn: j + 1, endLineNumber: i + 1, endColumn: j + 2,
                        message: `❌ Unexpected closing character '${char}'. Check if your brackets are balanced.`,
                        severity: monaco.MarkerSeverity.Error, source: 'Syntax Audit'
                    });
                }
            }
        }
    }

    // Any remaining items in stack are unclosed openers
    while (stack.length > 0) {
        const item = stack.pop();
        markers.push({
            startLineNumber: item.line, startColumn: item.col, endLineNumber: item.line, endColumn: item.col + 1,
            message: `❌ Unclosed opening character '${item.char}'. Make sure to close every bracket and parenthesis.`,
            severity: monaco.MarkerSeverity.Error, source: 'Syntax Audit'
        });
    }

    return markers;
}

// ──────────────────────────────────────────────────────────────
//  PROGRAM RELEVANCE CHECKER
//  Ensures student's code actually relates to the assigned program.
//  If a student writes "counter app" code for a "login form" question,
//  this will flag it immediately.
// ──────────────────────────────────────────────────────────────

// Common English stop-words to ignore when extracting keywords
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'is','are','was','were','be','been','being','have','has','had','do',
  'does','did','will','would','could','should','may','might','shall',
  'that','this','these','those','it','its','by','from','up','out',
  'about','into','through','during','before','after','above','below',
  'write','create','build','make','implement','develop','using','use',
  'simple','basic','program','application','app','flutter','dart','widget',
  'code','display','show','which','your','the','how','when','where','what',
]);

/**
 * Extracts meaningful keywords from a program title + description.
 * @param {{ title: string, description: string }} program
 * @returns {string[]}
 */
function extractProgramKeywords(program) {
  const text = `${program.title} ${program.description}`.toLowerCase();
  // Split on non-word chars, filter stop-words, filter short words
  return [...new Set(
    text
      .split(/\W+/)
      .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
  )];
}

/**
 * Checks if the student's code is relevant to the assigned program.
 * Returns a Monaco marker object if irrelevant, or null if ok.
 *
 * @param {string} code
 * @param {{ title: string, description: string }} program
 * @param {object} monaco
 * @returns {object|null}
 */
export function checkProgramRelevance(code, program, monaco) {
  if (!code || !program || code.trim().length < 30) return null; // too little code to judge

  const codeLower = code.toLowerCase();
  const keywords = extractProgramKeywords(program);

  if (keywords.length === 0) return null; // no meaningful keywords to check

  // Count how many unique program keywords appear anywhere in the code
  const matched = keywords.filter(kw => codeLower.includes(kw));
  const matchRatio = matched.length / keywords.length;

  // If less than 15% of program keywords appear → likely off-topic code
  if (matchRatio < 0.15 && matched.length < 2) {
    return {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 100,
      message: `⚠️ PROGRAM MISMATCH: This code does not appear to relate to the assigned program — "${program.title}". Make sure you are solving the correct question before submitting.`,
      severity: monaco.MarkerSeverity.Warning,
      source: 'Program Validator',
      code: 'program-mismatch',
    };
  }

  return null;
}
