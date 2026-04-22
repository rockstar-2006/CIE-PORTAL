// API endpoint that returns fresh DartPad instance
// Uses unique ID to retrieve code from sessionStorage
export default function handler(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).send("<h1>Error: No ID provided</h1>");
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flutter App</title>
  <style>
    * { margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #loading { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #f8fafc; font-family: monospace; color: #999; }
    #container { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="loading">⚡ Starting Flutter...</div>
  <div id="container"></div>

  <script>
    // Retrieve code from parent's sessionStorage
    const randomId = '${id}';
    const code = window.parent.sessionStorage.getItem('flutter_code_' + randomId);
    
    console.log('Checking flutter code ID: ' + randomId);
    
    if (!code) {
      console.error('No code found for ID: ' + randomId);
      document.getElementById('loading').innerHTML = 'Error: No code found';
    } else if (code.trim().length === 0) {
      console.error('Code is empty!');
      document.getElementById('loading').innerHTML = 'Error: Code is empty';
    } else {
      const status = document.getElementById('loading');
      status.style.display = 'flex';
      status.innerHTML = '⚡ Synchronizing with Editor...';
      
      const timestamp = Date.now();
      const rnd = Math.random().toString(36).substring(7);
      
      // The 'v' parameter forces DartPad to ignore any previously cached code for this URL
      const url = 'https://dartpad.dev/embed-flutter.html?theme=light&run=true&split=0&v=' + timestamp + '&cb=' + rnd + '&code=' + encodeURIComponent(code);
      
      const container = document.getElementById('container');
      container.innerHTML = '';
      
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#fff;';
      iframe.allow = 'clipboard-read; clipboard-write; geolocation';
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-forms allow-modals');
      
      iframe.onload = () => {
        status.innerHTML = '✅ Sync Complete. Building ' + code.split('\\n').length + ' lines...';
        setTimeout(() => { status.style.display = 'none'; }, 3000);
      };
      
      iframe.src = url;
      container.appendChild(iframe);
    }
  </script>
</body>
</html>`;

    // Force NO caching
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      "no-cache, no-store, must-revalidate, private",
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.status(200).send(html);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("<h1>Error</h1>");
  }
}
