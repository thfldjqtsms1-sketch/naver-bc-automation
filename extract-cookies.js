const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const CDP_URL = 'ws://127.0.0.1:18800/devtools/browser/df6951cb-42ce-4508-9c27-3e48f27dc462';
const OUTPUT_PATH = path.join(__dirname, 'playwright', 'storage', 'naver-session.json');

async function extractCookies() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(CDP_URL);
    let messageId = 1;
    
    ws.on('open', () => {
      // Get all cookies
      ws.send(JSON.stringify({
        id: messageId++,
        method: 'Storage.getCookies'
      }));
    });
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.result && msg.result.cookies) {
        // Filter naver cookies
        const naverCookies = msg.result.cookies.filter(c => 
          c.domain.includes('naver.com') || c.domain.includes('.naver.com')
        );
        
        // Convert to Playwright format
        const playwrightCookies = naverCookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          expires: c.expires || -1,
          httpOnly: c.httpOnly || false,
          secure: c.secure || false,
          sameSite: c.sameSite || 'Lax'
        }));
        
        const sessionData = {
          cookies: playwrightCookies,
          origins: []
        };
        
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sessionData, null, 2));
        console.log(`Saved ${playwrightCookies.length} cookies to ${OUTPUT_PATH}`);
        
        ws.close();
        resolve(sessionData);
      }
    });
    
    ws.on('error', (err) => {
      reject(err);
    });
    
    setTimeout(() => {
      ws.close();
      reject(new Error('Timeout'));
    }, 10000);
  });
}

extractCookies()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
