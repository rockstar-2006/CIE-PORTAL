// ═══════════════════════════════════════════════════════════
//  Professional Dart Structural Linter
//  Tracks brackets, braces, and dynamic syntax patterns
// ═══════════════════════════════════════════════════════════

export function runDartLinter(code, monaco, model, program = null) {
  if (!code || !monaco || !model) return;
  const markers = [];
  const lines = code.split('\n');

  // 1. Structural Bracket/Brace Matching (Not hardcoded)
  const stack = [];
  const openers = { '{': '}', '(': ')', '[': ']' };
  const closers = { '}': '{', ')': '(', ']': '[' };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      if (openers[char]) {
        stack.push({ char, line: i + 1, col: j + 1 });
      } else if (closers[char]) {
        if (stack.length === 0) {
          markers.push({
            startLineNumber: i + 1, startColumn: j + 1,
            endLineNumber: i + 1, endColumn: j + 2,
            message: `❌ Unexpected closer '${char}'. No matching opener found.`,
            severity: monaco.MarkerSeverity.Error,
            source: 'Dart Structure'
          });
        } else {
          const last = stack.pop();
          if (last.char !== closers[char]) {
            markers.push({
              startLineNumber: i + 1, startColumn: j + 1,
              endLineNumber: i + 1, endColumn: j + 2,
              message: `❌ Mismatched closer '${char}'. Expected '${openers[last.char]}' for opener at line ${last.line}.`,
              severity: monaco.MarkerSeverity.Error,
              source: 'Dart Structure'
            });
          }
        }
      }
    }
  }

  // Flag any unclosed openers
  while (stack.length > 0) {
    const last = stack.pop();
    markers.push({
      startLineNumber: last.line, startColumn: last.col,
      endLineNumber: last.line, endColumn: last.col + 1,
      message: `❌ Unclosed opener '${last.char}'. Did you forget a '${openers[last.char]}'?`,
      severity: monaco.MarkerSeverity.Error,
      source: 'Dart Structure'
    });
  }

  // 2. Semicolon Enforcement
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.length > 0 && 
        !trimmed.endsWith('{') && !trimmed.endsWith('}') && 
        !trimmed.endsWith(';') && !trimmed.endsWith(',') &&
        !trimmed.startsWith('import') && !trimmed.startsWith('class') &&
        !trimmed.startsWith('//') && !trimmed.includes('=>') &&
        !trimmed.startsWith('void main') && !trimmed.startsWith('if') &&
        !trimmed.startsWith('for') && !trimmed.startsWith('while')) {
       
       // Only flag if it looks like a variable assignment or function call
       if (trimmed.includes('=') || trimmed.includes('(')) {
          markers.push({
            startLineNumber: i + 1, startColumn: line.length + 1,
            endLineNumber: i + 1, endColumn: line.length + 2,
            message: "⚠️ Missing semicolon (;) at the end of the statement.",
            severity: monaco.MarkerSeverity.Warning
          });
       }
    }
  });

  // 3. Program Relevance Check
  if (program) {
    const relevanceMarker = checkProgramRelevance(code, program, monaco);
    if (relevanceMarker) markers.unshift(relevanceMarker);
  }

  monaco.editor.setModelMarkers(model, 'dart-linter', markers);
}

function checkProgramRelevance(code, program, monaco) {
  if (!code || !program || code.trim().length < 30) return null;
  const keywords = (program.title + ' ' + program.description).toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 4 && !['flutter','dart','widget','simple','basic'].includes(w));
  
  if (keywords.length === 0) return null;
  const codeLower = code.toLowerCase();
  const matched = keywords.filter(kw => codeLower.includes(kw));
  
  if (matched.length / keywords.length < 0.1) {
    return {
      startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 100,
      message: `⚠️ PROGRAM MISMATCH: Your code does not seem to relate to "${program.title}". Check the requirements.`,
      severity: monaco.MarkerSeverity.Warning,
      source: 'Validator'
    };
  }
  return null;
}
