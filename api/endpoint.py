#!/usr/bin/env python3
"""
API Endpoint Handler — /api/endpoint
POST handler with input validation and JSON response.
Can run standalone or via serverless runtime.
"""

import json
import sys
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

ADMIN_API_KEY = os.environ.get('ADMIN_API_KEY', '')


class EndpointHandler(BaseHTTPRequestHandler):
    """HTTP request handler for /api/endpoint"""

    def _set_cors_headers(self):
        """Set CORS headers for all responses"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Content-Type', 'application/json')

    def _send_json(self, data, status=200):
        """Send JSON response with proper headers"""
        self.send_response(status)
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2).encode('utf-8'))

    def do_OPTIONS(self):
        """Handle OPTIONS (CORS preflight)"""
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_POST(self):
        """Handle POST request with input validation"""
        # Validate authorization if ADMIN_API_KEY is set
        if ADMIN_API_KEY:
            auth_header = self.headers.get('Authorization', '')
            token = auth_header.replace('Bearer ', '').strip()
            if token != ADMIN_API_KEY:
                return self._send_json({'error': 'Unauthorized'}, 401)

        # Read and parse request body
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body) if body else {}
        except (ValueError, json.JSONDecodeError):
            return self._send_json({'error': 'Invalid JSON'}, 400)

        # Input validation
        if not isinstance(data, dict):
            return self._send_json({'error': 'Request body must be a JSON object'}, 400)

        # Required field validation (example: require 'name' and 'email')
        required_fields = ['name', 'email']
        missing = [f for f in required_fields if f not in data]
        if missing:
            return self._send_json(
                {'error': f'Missing required fields: {", ".join(missing)}'},
                400
            )

        # Basic email format validation
        email = data.get('email', '')
        if '@' not in email or '.' not in email.split('@')[-1]:
            return self._send_json({'error': 'Invalid email format'}, 400)

        # Process the request
        response = {
            'status': 'success',
            'message': 'Request processed successfully',
            'data': {
                'name': data.get('name'),
                'email': data.get('email'),
                'timestamp': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
            }
        }

        return self._send_json(response, 200)

    def do_GET(self):
        """Handle GET (not supported)"""
        self._send_json({'error': 'Method not allowed'}, 405)

    def log_message(self, format, *args):
        """Suppress default logging"""
        pass


def handler(req, res):
    """Vercel serverless function compatibility wrapper"""
    # For Vercel: this would need a Vercel Python runtime
    # This function signature matches Vercel's expectations
    pass


def run_server(port=8000):
    """Run standalone HTTP server"""
    server_address = ('', port)
    httpd = HTTPServer(server_address, EndpointHandler)
    print(f"Server running on http://localhost:{port}/api/endpoint")
    print("POST with JSON body: {'name': 'John', 'email': 'john@example.com'}")
    httpd.serve_forever()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run_server(port)
