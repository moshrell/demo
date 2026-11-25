const http=require('http'),fs=require('fs'),path=require('path');
const root=require('path').resolve(__dirname,'..','dist'), base='/vorschau/auto/glanzleistung/';
const ht=fs.readFileSync(root+'/.htaccess','utf8'); const csp=ht.match(/Content-Security-Policy "([^"]+)"/)[1];
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.mp4':'video/mp4','.woff2':'font/woff2','.svg':'image/svg+xml'};
http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]); if(!u.startsWith(base)){r.writeHead(404);return r.end();} let f=path.join(root,u.slice(base.length)); if(fs.existsSync(f)&&fs.statSync(f).isDirectory()) f=path.join(f,'index.html'); if(!fs.existsSync(f)){r.writeHead(404);return r.end();} r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream','Content-Security-Policy':csp}); fs.createReadStream(f).pipe(r);}).listen(4400);
