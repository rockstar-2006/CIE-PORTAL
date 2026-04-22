// ═══════════════════════════════════════════════════════════
//  Professional Dart & Flutter Completion Provider
//  Provides IDE-grade IntelliSense for Monaco Editor
// ═══════════════════════════════════════════════════════════

export function registerDartIntellisense(monaco) {
  if (!monaco) return;

  // Check if already registered to avoid duplicates
  if (monaco.languages.getLanguages().some(l => l.id === 'dart' && l.hasCompletionItems)) {
     // return; // Already registered
  }

  monaco.languages.registerCompletionItemProvider('dart', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = [
        // Keywords
        ...keywords.map(k => ({
          label: k,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: k,
          range: range,
        })),
        // Snippets
        ...snippets.map(s => ({
          label: s.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: s.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: s.documentation,
          range: range,
        })),
        // Widgets
        ...widgets.map(w => ({
          label: w,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: w,
          range: range,
        })),
        // Properties
        ...properties.map(p => ({
          label: p,
          kind: monaco.languages.CompletionItemKind.Property,
          insertText: p,
          range: range,
        })),
      ];

      return { suggestions };
    },
  });
}

const keywords = [
  'abstract', 'as', 'assert', 'async', 'await', 'break', 'case', 'catch', 'class',
  'const', 'continue', 'covariant', 'default', 'deferred', 'do', 'dynamic', 'else',
  'enum', 'export', 'extends', 'extension', 'external', 'factory', 'false', 'final',
  'finally', 'for', 'get', 'if', 'implements', 'import', 'in', 'is', 'library',
  'mixin', 'new', 'null', 'on', 'operator', 'part', 'rethrow', 'return', 'set',
  'show', 'static', 'super', 'switch', 'sync', 'this', 'throw', 'true', 'try',
  'typedef', 'var', 'void', 'while', 'with', 'yield'
];

const widgets = [
  'MaterialApp', 'Scaffold', 'AppBar', 'Container', 'Center', 'Text', 'Column',
  'Row', 'Stack', 'ListView', 'Expanded', 'Padding', 'SizedBox', 'Icon', 'Image',
  'ElevatedButton', 'TextButton', 'IconButton', 'TextField', 'FloatingActionButton',
  'Drawer', 'Card', 'ListTile', 'BottomNavigationBar', 'DefaultTabController',
  'TabBar', 'TabBarView', 'StatelessWidget', 'StatefulWidget', 'State', 'GestureDetector',
  'InkWell', 'SingleChildScrollView', 'Align', 'Opacity', 'Positioned', 'Wrap'
];

const properties = [
  'child', 'children', 'appBar', 'body', 'title', 'home', 'style', 'color',
  'onPressed', 'mainAxisAlignment', 'crossAxisAlignment', 'padding', 'margin',
  'decoration', 'width', 'height', 'decoration', 'alignment', 'controller',
  'items', 'onTap', 'leading', 'trailing', 'actions', 'backgroundColor', 'elevation'
];

const snippets = [
  {
    label: 'stless',
    documentation: 'New Stateless Widget',
    insertText: 'class ${1:MyWidget} extends StatelessWidget {\n  const ${1:MyWidget}({super.key});\n\n  @override\n  Widget build(BuildContext context) {\n    return ${2:Container()};\n  }\n}'
  },
  {
    label: 'stful',
    documentation: 'New Stateful Widget',
    insertText: 'class ${1:MyWidget} extends StatefulWidget {\n  const ${1:MyWidget}({super.key});\n\n  @override\n  State<${1:MyWidget}> createState() => _${1:MyWidget}State();\n}\n\nclass _${1:MyWidget}State extends State<${1:MyWidget}> {\n  @override\n  Widget build(BuildContext context) {\n    return ${2:Container()};\n  }\n}'
  },
  {
    label: 'main',
    documentation: 'Flutter main() entry point',
    insertText: 'void main() {\n  runApp(const ${1:MyApp}());\n}'
  }
];
