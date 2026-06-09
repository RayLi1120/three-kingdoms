import http.server
import socket
import json

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/ip':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            # Get local IP of the server on the active network interface
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                # Use a dummy destination, doesn't need to be reachable
                s.connect(('10.255.255.255', 1))
                ip = s.getsockname()[0]
            except Exception:
                ip = '127.0.0.1'
            finally:
                s.close()
                
            self.wfile.write(json.dumps({'ip': ip}).encode('utf-8'))
        else:
            super().do_GET()

if __name__ == '__main__':
    server_address = ('', 8000)
    httpd = http.server.HTTPServer(server_address, CustomHandler)
    print("Serving HTTP on port 8000 with custom IP API...")
    httpd.serve_forever()
