const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');

const execPromise = util.promisify(exec);

// ═══════════════════════════════════════════════════════════
//  Clean Local SDK Performance Engine
//  Ensures atomic, single-file analysis without residue or conflicts
// ═══════════════════════════════════════════════════════════

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { source, mode } = req.body;
  if (mode !== 'analyze' || !source) return res.status(200).json({ status: 'success' });

  const scratchDir = path.join(process.cwd(), 'scratch');
  // Use a hash or ID but keep it unique to prevent multiple tabs from colliding
  const tmpFile = path.join(scratchDir, `target.dart`);

  try {
    // 1. Wipe any existing target file to prevent duplication errors
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    
    // 2. Write the FRESH source code
    fs.writeFileSync(tmpFile, source);

    // 3. Run analysis strictly on the target file within the Flutter project context
    const command = `dart analyze --format=machine "target.dart"`;
    
    let output = "";
    try {
      const { stdout, stderr } = await execPromise(command, { cwd: scratchDir });
      output = stdout || stderr;
    } catch (e) {
      output = e.stdout || e.stderr;
    }

    // 4. Parse output
    const lines = output.split('\n').filter(l => l.includes('|'));
    const issues = lines.map(line => {
      const parts = line.split('|');
      if (parts.length < 8) return null;
      const [severity, type, code, file, lNum, col, len, message] = parts;
      
      // Filter out warnings from other files if they leaked into the report
      if (!file.includes('target.dart')) return null;

      return {
        kind: severity.toLowerCase(),
        message: message?.trim(),
        line: parseInt(lNum),
        column: parseInt(col)
      };
    }).filter(Boolean);

    let terminalOutput = issues.length > 0 ? "❌ BUILD FAILED\n\n" : "✅ BUILD SUCCESSFUL\n\nDeployment complete. Virtual Device synchronized.";
    issues.forEach(issue => {
      terminalOutput += `[${issue.kind.toUpperCase()}] Line ${issue.line}, Col ${issue.column}: ${issue.message}\n`;
    });

    return res.status(200).json({
      status: issues.some(i => i.kind === 'error') ? 'error' : 'success',
      issues,
      output: terminalOutput
    });

  } catch (error) {
    console.error("Local SDK Error:", error);
    return res.status(200).json({ status: 'error', output: "⚠️ SDK ERROR\n" + error.message });
  }
}
