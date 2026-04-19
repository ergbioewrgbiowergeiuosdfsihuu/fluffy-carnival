const http = require('http');
const https = require('https');
const { URL } = require('url');

const proxyServer = http.createServer((clientReq, clientRes) => {
    // The Service Worker will send the target URL in this header
    const targetUrlString = clientReq.headers['x-proxy-target'];

    if (!targetUrlString) {
        clientRes.writeHead(400);
        return clientRes.end('Missing target URL header');
    }

    try {
        const targetUrl = new URL(targetUrlString);
        const requestModule = targetUrl.protocol === 'https:' ? https : http;

        // Clean headers to avoid confusing the target server
        const forwardHeaders = { ...clientReq.headers };
        delete forwardHeaders['host'];
        delete forwardHeaders['x-proxy-target'];

        const options = {
            hostname: targetUrl.hostname,
            port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
            path: targetUrl.pathname + targetUrl.search,
            method: clientReq.method,
            headers: forwardHeaders,
        };

        // Forward the request
        const proxyReq = requestModule.request(options, (proxyRes) => {
            clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(clientRes, { end: true });
        });

        proxyReq.on('error', (err) => {
            clientRes.writeHead(500);
            clientRes.end('Proxy Network Error: ' + err.message);
        });

        clientReq.pipe(proxyReq, { end: true });

    } catch (err) {
        clientRes.writeHead(500);
        clientRes.end('Proxy Parsing Error: ' + err.message);
    }
});

// Handle WebSocket Upgrades
proxyServer.on('upgrade', (clientReq, clientSocket, head) => {
    const targetUrlString = clientReq.headers['x-proxy-target'];
    if (!targetUrlString) return clientSocket.end();

    try {
        const targetUrl = new URL(targetUrlString);
        const requestModule = targetUrl.protocol === 'wss:' || targetUrl.protocol === 'https:' ? https : http;

        const options = {
            hostname: targetUrl.hostname,
            port: targetUrl.port || (targetUrl.protocol === 'wss:' ? 443 : 80),
            path: targetUrl.pathname + targetUrl.search,
            method: clientReq.method,
            headers: clientReq.headers,
        };

        const proxyReq = requestModule.request(options);
        
        proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
            clientSocket.write(
                'HTTP/1.1 101 Web Socket Protocol Handshake\r\n' +
                'Upgrade: WebSocket\r\n' +
                'Connection: Upgrade\r\n' +
                '\r\n'
            );
            
            proxySocket.pipe(clientSocket);
            clientSocket.pipe(proxySocket);
        });

        proxyReq.on('error', () => {
            clientSocket.end();
        });

        proxyReq.end();
    } catch (err) {
        clientSocket.end();
    }
});

// Render provides the PORT environment variable automatically
const PORT = process.env.PORT || 8080;
proxyServer.listen(PORT, () => {
    console.log(`[+] Advanced Proxy Backend running on port ${PORT}`);
});
