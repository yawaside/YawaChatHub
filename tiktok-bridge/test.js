const { spawn } = require('child_process');
const p = spawn('node', ['bridge.js'], { stdio: ['pipe','pipe','inherit'] });
let buf=''; let chat=0;
p.stdout.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const l = buf.slice(0,i).trim();
    buf = buf.slice(i+1);
    if (!l) continue;
    try {
      const o = JSON.parse(l);
      if (o.type === 'chat') { chat++; if (chat < 5) console.log('CHAT:', o.author, '|', o.text); }
      else if (o.type === 'log') console.log('LOG:', o.message);
      else console.log(o.type.toUpperCase(), o.status || o.viewers || '');
    } catch {}
  }
});
p.stdin.write(JSON.stringify({type:'connect', user:'aljazeeraenglish'}) + '\n');
setTimeout(() => { console.log('=== chats:', chat); process.exit(0); }, 25000);
