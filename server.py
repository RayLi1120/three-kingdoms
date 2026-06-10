import http.server
import socket
import json
import random
import time
import urllib.parse

# Global state for PvP
pvp_queue = {}
player_lobbies = {}
pvp_lobbies = {}
# Preset bot names for shadow lobbies
SHADOW_NAMES = [
    '臥龍子弟', '鳳雛傳人', '天策門生', '白馬義軍',
    '赤兔神騎', '劑仙弟子', '虎豹鐵騎', '錦帆遊客'
]
# default shadow database of player teams
shadow_pool = [
    # Preset Team 1: Peach Garden trio
    {
        "playerId": "preset",
        "username": "劉玄德",
        "team": [
            {"templateId": "liu_bei", "star": 2, "skillLevel": 2, "x": 3, "y": 7},
            {"templateId": "guan_yu", "star": 2, "skillLevel": 2, "x": 4, "y": 7},
            {"templateId": "zhang_fei", "star": 2, "skillLevel": 2, "x": 2, "y": 6}
        ]
    },
    # Preset Team 2: Wei Intellects
    {
        "playerId": "preset",
        "username": "曹孟德",
        "team": [
            {"templateId": "cao_cao", "star": 2, "skillLevel": 2, "x": 3, "y": 7},
            {"templateId": "guo_jia", "star": 2, "skillLevel": 2, "x": 2, "y": 8},
            {"templateId": "xun_yu", "star": 2, "skillLevel": 2, "x": 5, "y": 8}
        ]
    },
    # Preset Team 3: East Wu Commanders
    {
        "playerId": "preset",
        "username": "孫仲謀",
        "team": [
            {"templateId": "sun_quan", "star": 2, "skillLevel": 2, "x": 3, "y": 7},
            {"templateId": "zhou_yu", "star": 2, "skillLevel": 2, "x": 2, "y": 8},
            {"templateId": "lu_xun", "star": 2, "skillLevel": 2, "x": 4, "y": 8}
        ]
    },
    # Preset Team 4: Yellow Turban
    {
        "playerId": "preset",
        "username": "張角",
        "team": [
            {"templateId": "zhang_jiao", "star": 2, "skillLevel": 2, "x": 3, "y": 8},
            {"templateId": "yuan_shao", "star": 2, "skillLevel": 2, "x": 2, "y": 7},
            {"templateId": "yuan_shu", "star": 2, "skillLevel": 2, "x": 5, "y": 7}
        ]
    },
    # Preset Team 5: Hero Beauty
    {
        "playerId": "preset",
        "username": "呂奉先",
        "team": [
            {"templateId": "lu_bu", "star": 2, "skillLevel": 2, "x": 3, "y": 6},
            {"templateId": "diao_chan", "star": 2, "skillLevel": 2, "x": 3, "y": 8},
            {"templateId": "zhao_yun", "star": 2, "skillLevel": 2, "x": 4, "y": 7}
        ]
    }
]

def get_random_shadow_team(player_id):
    valid_entries = []
    for entry in shadow_pool:
        if isinstance(entry, dict):
            if entry.get("playerId") != player_id:
                valid_entries.append(entry)
        else:
            valid_entries.append({"team": entry, "username": random.choice(SHADOW_NAMES)})
            
    if not valid_entries:
        valid_entries = [entry for entry in shadow_pool if isinstance(entry, dict) and entry.get("playerId") == "preset"]
        
    chosen = random.choice(valid_entries)
    if isinstance(chosen, dict):
        return chosen.get("team"), chosen.get("username", random.choice(SHADOW_NAMES))
    else:
        return chosen, random.choice(SHADOW_NAMES)

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
                
            # If not in a lobby yet, check if we should trigger fallback
            if player_id not in player_lobbies:
                if fallback and player_id in pvp_queue:
                    q_entry = pvp_queue[player_id]
                    if not q_entry.get("room", ""):
                        # Create a shadow lobby
                        lobby_id = f"lobby_shadow_{random.randint(1000, 9999)}_{int(time.time())}"
                        opp_team, opp_username = get_random_shadow_team(player_id)
                        opp_id = f"shadow_{random.randint(100, 999)}"
                        
                        pvp_lobbies[lobby_id] = {
                            "players": {
                                player_id: { "team": pvp_queue[player_id]["team"], "username": pvp_queue[player_id].get("username", "主公"), "ready": False, "reported_result": None, "points": 0 },
                                opp_id: { "team": opp_team, "username": opp_username, "ready": True, "reported_result": None, "points": 0 }
                            },
                            "current_round": 1,
                            "prep_start_time": time.time(),
                            "status": "prep",
                            "combat_seed": random.randint(1, 100000),
                            "is_shadow": True
                        }
                        
                        player_lobbies[player_id] = lobby_id
                        del pvp_queue[player_id]
                        
                        self.send_json_response(200, {
                            'status': 'matched',
                            'lobbyId': lobby_id
                        })
                        return
                    else:
                        self.send_json_response(200, {'status': 'waiting'})
                        return
                else:
                    self.send_json_response(200, {'status': 'waiting'})
                    return
                    
            # Player is in a lobby, retrieve details
            lobby_id = player_lobbies[player_id]
            if lobby_id not in pvp_lobbies:
                # Lobby was destroyed or cleaned up
                self.send_json_response(200, {'status': 'waiting'})
                return
                
            lobby = pvp_lobbies[lobby_id]
            
            # Handle countdown time calculations
            elapsed = time.time() - lobby["prep_start_time"]
            remaining = max(0, 30 - int(elapsed))
            
            # Auto-ready if time ran out
            if remaining == 0 and lobby["status"] == "prep":
                # Mark everyone ready
                for p_id in lobby["players"]:
                    lobby["players"][p_id]["ready"] = True
                lobby["status"] = "combat"
                lobby["combat_seed"] = random.randint(1, 100000)
                
            opp_id = next(p for p in lobby["players"] if p != player_id)
            opp_info = lobby["players"][opp_id]
            my_info = lobby["players"][player_id]
            
            self.send_json_response(200, {
                "status": "in_lobby",
                "lobbyStatus": lobby["status"],
                "lobbyId": lobby_id,
                "currentRound": lobby["current_round"],
                "remainingPrepTime": remaining,
                "myPoints": my_info["points"],
                "oppPoints": opp_info["points"],
                "myReady": my_info["ready"],
                "oppReady": opp_info["ready"],
                "myUsername": my_info.get("username", "主公"),
                "oppUsername": opp_info.get("username", "未知武將"),
                "opponent": {
                    "playerId": opp_id,
                    "username": opp_info.get("username", "未知武將"),
                    "team": opp_info["team"]
                },
                "seed": lobby["combat_seed"],
                "isShadow": lobby["is_shadow"]
            })
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
            username = data.get('username', '主公')[:12]  # cap at 12 chars
            room = data.get('room', '').strip()  # lobby room code
            
            if not player_id:
                self.send_json_response(400, {'error': 'Missing playerId'})
                return
                
            # Clean up old game_over lobbies for this player first
            if player_id in player_lobbies:
                lobby_id = player_lobbies[player_id]
                if lobby_id in pvp_lobbies:
                    lobby = pvp_lobbies[lobby_id]
                    if lobby.get("status") == "game_over":
                        del pvp_lobbies[lobby_id]
                        for p_id, l_id in list(player_lobbies.items()):
                            if l_id == lobby_id:
                                del player_lobbies[p_id]
                else:
                    del player_lobbies[player_id]

            # Check if player is already in an active lobby
            if player_id in player_lobbies:
                lobby_id = player_lobbies[player_id]
                self.send_json_response(200, {
                    'status': 'matched',
                    'lobbyId': lobby_id
                })
                return
                
            # Look for another queuing player to pair with the same room code
            matched_player_id = None
            for q_id, q_info in list(pvp_queue.items()):
                if q_id != player_id:
                    if q_info.get("room", "") == room:
                        matched_player_id = q_id
                        break
                    
            if matched_player_id:
                # Match found! Create a synchronized PvP lobby
                lobby_id = f"lobby_{random.randint(1000, 9999)}_{int(time.time())}"
                matched_username = pvp_queue[matched_player_id].get('username', '主公')
                
                pvp_lobbies[lobby_id] = {
                    "players": {
                        player_id: { "team": team, "username": username, "ready": False, "reported_result": None, "points": 0 },
                        matched_player_id: { "team": pvp_queue[matched_player_id]["team"], "username": matched_username, "ready": False, "reported_result": None, "points": 0 }
                    },
                    "current_round": 1,
                    "prep_start_time": time.time(),
                    "status": "prep",
                    "combat_seed": random.randint(1, 100000),
                    "is_shadow": False
                }
                
                player_lobbies[player_id] = lobby_id
                player_lobbies[matched_player_id] = lobby_id
                
                # Remove matched player from queue
                if matched_player_id in pvp_queue:
                    del pvp_queue[matched_player_id]
                if player_id in pvp_queue:
                    del pvp_queue[player_id]
                    
                self.send_json_response(200, {
                    'status': 'matched',
                    'lobbyId': lobby_id
                })
            else:
                # No match found, join queue with room code
                pvp_queue[player_id] = {
                    "team": team,
                    "username": username,
                    "room": room,
                    "joined_at": time.time()
                }
                self.send_json_response(200, {'status': 'waiting'})
                
        elif path == '/api/pvp/lobby/ready':
            player_id = data.get('playerId')
            lobby_id = data.get('lobbyId')
            team = data.get('team', [])
            
            if not player_id or not lobby_id or lobby_id not in pvp_lobbies:
                self.send_json_response(400, {'error': 'Invalid request'})
                return
                
            lobby = pvp_lobbies[lobby_id]
            if player_id in lobby["players"]:
                lobby["players"][player_id]["team"] = team
                lobby["players"][player_id]["ready"] = True
                
            # In a Shadow lobby, the shadow opponent is always ready
            if lobby["is_shadow"]:
                lobby["status"] = "combat"
                lobby["combat_seed"] = random.randint(1, 100000)
            else:
                # Check if all players in the lobby are ready
                all_ready = all(p_info["ready"] for p_info in lobby["players"].values())
                if all_ready:
                    lobby["status"] = "combat"
                    lobby["combat_seed"] = random.randint(1, 100000)
                    
            self.send_json_response(200, {"status": "ok"})
            
        elif path == '/api/pvp/lobby/report':
            player_id = data.get('playerId')
            lobby_id = data.get('lobbyId')
            result = data.get('result')  # 'victory' or 'defeat'
            
            if not player_id or not lobby_id or lobby_id not in pvp_lobbies:
                self.send_json_response(400, {'error': 'Invalid request'})
                return
                
            lobby = pvp_lobbies[lobby_id]
            if player_id in lobby["players"]:
                lobby["players"][player_id]["reported_result"] = result
                
            # Resolve result for shadow lobby instantly
            if lobby["is_shadow"]:
                opp_id = next(p for p in lobby["players"] if p != player_id)
                lobby["players"][opp_id]["reported_result"] = "defeat" if result == "victory" else "victory"
                
            # Check if all reported
            all_reported = all(p_info["reported_result"] is not None for p_info in lobby["players"].values())
            if all_reported:
                # Determine score gain for the round
                # Rounds 1-5: +1, 6-10: +2, 11-15: +3, 16-20: +4
                r = lobby["current_round"]
                score_gain = 1
                if r > 15:
                    score_gain = 4
                elif r > 10:
                    score_gain = 3
                elif r > 5:
                    score_gain = 2
                    
                for p_id, p_info in lobby["players"].items():
                    if p_info["reported_result"] == "victory":
                        p_info["points"] += score_gain
                        
                # Advance round
                lobby["current_round"] += 1
                
                # Check game over
                if lobby["current_round"] > 20:
                    lobby["status"] = "game_over"
                else:
                    lobby["status"] = "prep"
                    lobby["prep_start_time"] = time.time()
                    # Reset player ready/results for the next round
                    for p_id, p_info in lobby["players"].items():
                        p_info["ready"] = False
                        p_info["reported_result"] = None
                        
                    # If it's a shadow lobby, update the shadow opponent's team for the next round
                    if lobby["is_shadow"]:
                        opp_id = next(p for p in lobby["players"] if p != player_id)
                        opp_team, opp_username = get_random_shadow_team(player_id)
                        lobby["players"][opp_id]["team"] = opp_team
                        lobby["players"][opp_id]["username"] = opp_username
                        lobby["players"][opp_id]["ready"] = True
                        
            self.send_json_response(200, {"status": "ok"})
                
        elif path == '/api/pvp/cancel':
            player_id = data.get('playerId')
            if player_id in pvp_queue:
                del pvp_queue[player_id]
            if player_id in player_lobbies:
                lobby_id = player_lobbies[player_id]
                if lobby_id in pvp_lobbies:
                    del pvp_lobbies[lobby_id]
                for p_id, l_id in list(player_lobbies.items()):
                    if l_id == lobby_id:
                        del player_lobbies[p_id]
            self.send_json_response(200, {'status': 'cancelled'})
            
        elif path == '/api/pvp/upload':
            team = data.get('team', [])
            p_id = data.get('playerId', None)
            username = data.get('username', '未知主公')
            if team and len(team) > 0:
                shadow_pool.append({
                    "playerId": p_id,
                    "username": username,
                    "team": team
                })
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
