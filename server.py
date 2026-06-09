import http.server
import socket
import json
import random
import time
import urllib.parse

# Global state for PvP
# queue map: playerId -> { "team": [...], "joined_at": float, "paired_with": str, "seed": int }
pvp_queue = {}
# pairs map: playerId -> opponent_info
pvp_pairs = {}
# default shadow database of player teams
shadow_pool = [
    # Preset Team 1: Peach Garden trio
    [
        {"templateId": "liu_bei", "star": 2, "skillLevel": 2, "x": 3, "y": 7},
        {"templateId": "guan_yu", "star": 2, "skillLevel": 2, "x": 4, "y": 7},
        {"templateId": "zhang_fei", "star": 2, "skillLevel": 2, "x": 2, "y": 6},
        {"templateId": "sentry_tower", "star": 1, "skillLevel": 1, "x": 3, "y": 6},
        {"templateId": "sentry_tower", "star": 1, "skillLevel": 1, "x": 4, "y": 6}
    ],
    # Preset Team 2: Wei Intellects
    [
        {"templateId": "cao_cao", "star": 2, "skillLevel": 2, "x": 3, "y": 7},
        {"templateId": "guo_jia", "star": 2, "skillLevel": 2, "x": 2, "y": 8},
        {"templateId": "xun_yu", "star": 2, "skillLevel": 2, "x": 5, "y": 8},
        {"templateId": "ballista_tower", "star": 1, "skillLevel": 1, "x": 1, "y": 8},
        {"templateId": "ballista_tower", "star": 1, "skillLevel": 1, "x": 6, "y": 8}
    ],
    # Preset Team 3: East Wu Commanders
    [
        {"templateId": "sun_quan", "star": 2, "skillLevel": 2, "x": 3, "y": 7},
        {"templateId": "zhou_yu", "star": 2, "skillLevel": 2, "x": 2, "y": 8},
        {"templateId": "lu_xun", "star": 2, "skillLevel": 2, "x": 4, "y": 8},
        {"templateId": "sentry_tower", "star": 1, "skillLevel": 1, "x": 3, "y": 6}
    ],
    # Preset Team 4: Yellow Turban
    [
        {"templateId": "zhang_jiao", "star": 2, "skillLevel": 2, "x": 3, "y": 8},
        {"templateId": "yuan_shao", "star": 2, "skillLevel": 2, "x": 2, "y": 7},
        {"templateId": "yuan_shu", "star": 2, "skillLevel": 2, "x": 5, "y": 7}
    ],
    # Preset Team 5: Hero Beauty
    [
        {"templateId": "lu_bu", "star": 2, "skillLevel": 2, "x": 3, "y": 6},
        {"templateId": "diao_chan", "star": 2, "skillLevel": 2, "x": 3, "y": 8},
        {"templateId": "zhao_yun", "star": 2, "skillLevel": 2, "x": 4, "y": 7}
    ]
]

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)
        
        if path == '/api/ip':
            self.send_json_response(200, {'ip': self.get_local_ip()})
            
        elif path == '/api/pvp/poll':
            player_id = query.get('playerId', [None])[0]
            fallback = query.get('fallback', ['false'])[0] == 'true'
            
            if not player_id:
                self.send_json_response(400, {'error': 'Missing playerId'})
                return
                
            # Check if matched in real-time
            if player_id in pvp_pairs:
                opp_info = pvp_pairs[player_id]
                self.send_json_response(200, {
                    'status': 'matched',
                    'opponent': opp_info['opponent'],
                    'seed': opp_info['seed'],
                    'isMirror': False
                })
                # Clean up match state once consumed
                del pvp_pairs[player_id]
                return
                
            # If waiting and fallback requested (over 5 seconds queue time)
            if fallback and player_id in pvp_queue:
                # Remove from queue and return a mirror team
                opp_team = random.choice(shadow_pool)
                seed = random.randint(1, 100000)
                del pvp_queue[player_id]
                self.send_json_response(200, {
                    'status': 'matched',
                    'opponent': {
                        'playerId': f'shadow_{random.randint(100, 999)}',
                        'team': opp_team
                    },
                    'seed': seed,
                    'isMirror': True
                })
                return
                
            self.send_json_response(200, {'status': 'waiting'})
        else:
            super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b''
        
        try:
            data = json.loads(post_data.decode('utf-8')) if post_data else {}
        except Exception:
            self.send_json_response(400, {'error': 'Invalid JSON'})
            return

        if path == '/api/pvp/join':
            player_id = data.get('playerId')
            team = data.get('team', [])
            
            if not player_id:
                self.send_json_response(400, {'error': 'Missing playerId'})
                return
                
            # Look for another queuing player to pair
            matched_player_id = None
            for q_id, q_info in pvp_queue.items():
                if q_id != player_id:
                    matched_player_id = q_id
                    break
                    
            if matched_player_id:
                # Match found! Create a pair
                seed = random.randint(1, 100000)
                opp_info = pvp_queue[matched_player_id]
                
                # Pair player 1 (current requester) with player 2 (waiting)
                pvp_pairs[player_id] = {
                    'opponent': {
                        'playerId': matched_player_id,
                        'team': opp_info['team']
                    },
                    'seed': seed
                }
                
                # Pair player 2 with player 1
                pvp_pairs[matched_player_id] = {
                    'opponent': {
                        'playerId': player_id,
                        'team': team
                    },
                    'seed': seed
                }
                
                # Remove matched player from queue
                del pvp_queue[matched_player_id]
                
                self.send_json_response(200, {
                    'status': 'matched',
                    'opponent': pvp_pairs[player_id]['opponent'],
                    'seed': seed,
                    'isMirror': False
                })
            else:
                # No match found, join queue
                pvp_queue[player_id] = {
                    'team': team,
                    'joined_at': time.time()
                }
                self.send_json_response(200, {'status': 'waiting'})
                
        elif path == '/api/pvp/cancel':
            player_id = data.get('playerId')
            if player_id in pvp_queue:
                del pvp_queue[player_id]
            self.send_json_response(200, {'status': 'cancelled'})
            
        elif path == '/api/pvp/upload':
            team = data.get('team', [])
            if team and len(team) > 0:
                shadow_pool.append(team)
                # Keep pool size reasonable
                if len(shadow_pool) > 50:
                    shadow_pool.pop(5) # Remove older custom entries
            self.send_json_response(200, {'status': 'uploaded'})
            
        else:
            self.send_json_response(404, {'error': 'Not Found'})

    def send_json_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def get_local_ip(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(('10.255.255.255', 1))
            ip = s.getsockname()[0]
        except Exception:
            ip = '127.0.0.1'
        finally:
            s.close()
        return ip

if __name__ == '__main__':
    server_address = ('', 8000)
    httpd = http.server.HTTPServer(server_address, CustomHandler)
    print("Serving HTTP on port 8000 with custom IP API and PvP Matchmaking...")
    httpd.serve_forever()
