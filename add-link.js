const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();

p.brandLink.create({
  data: {
    url: 'https://naver.me/xpjMXir0',
    productName: '미라클뮤즈 메디크림 (기미미백)',
    status: 'READY'
  }
}).then(r => {
  console.log('Added:', r.id);
  process.exit(0);
}).catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
