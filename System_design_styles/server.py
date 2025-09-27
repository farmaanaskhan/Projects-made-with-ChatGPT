from flask import Flask, request, jsonify, send_from_directory
from google import genai
from google.genai import types
import os
import json

app = Flask(__name__, static_folder='static')

# --- CONFIGURATION ---
# IMPORTANT: Set your Gemini API key as an environment variable (GEMINI_API_KEY)
# In your terminal: export GEMINI_API_KEY="YOUR_API_KEY_HERE"
try:
    client = genai.Client()
except Exception as e:
    print(f"Error initializing Gemini client. Make sure GEMINI_API_KEY is set: {e}")
    client = None

# --- JSON SCHEMA DEFINITION ---
# This schema forces the AI to output data in a format your JavaScript can understand.
DIAGRAM_SCHEMA = {
    "type": "object",
    "properties": {
        "nodes": {
            "type": "array",
            "description": "List of system components (e.g., Load Balancer, Database).",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "Unique short identifier (e.g., 'LB', 'DB')."},
                    "name": {"type": "string", "description": "Display name for the component."},
                    "shape": {"type": "string", "enum": ["box", "circle", "diamond"], "description": "Visual shape of the component (default to 'box')."},
                    "description": {"type": "string", "description": "A brief explanation of the component's role."}
                },
                "required": ["id", "name"]
            }
        },
        "edges": {
            "type": "array",
            "description": "List of directed connections between components.",
            "items": {
                "type": "object",
                "properties": {
                    "from_id": {"type": "string", "description": "The 'id' of the source node."},
                    "to_id": {"type": "string", "description": "The 'id' of the destination node."},
                    "label": {"type": "string", "description": "Optional label for the connection (e.g., 'HTTP/S', 'Async Queue')."}
                },
                "required": ["from_id", "to_id"]
            }
        }
    },
    "required": ["nodes", "edges"]
}

# --- AI GENERATION ENDPOINT ---
@app.route('/api/generate_diagram', methods=['POST'])
def generate_diagram_data():
    if not client:
        return jsonify({"error": "AI client not initialized. Check your API key."}), 500
        
    data = request.json
    prompt = data.get('instructions')
    if not prompt:
        return jsonify({"error": "No instructions provided."}), 400

    system_prompt = (
        "You are an expert system architecture designer. "
        "Analyze the user's request and generate a simplified, high-level architecture diagram "
        "data structure. Only include relevant, major components. "
        "Do not include any text outside the JSON object."
    )
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                response_schema=DIAGRAM_SCHEMA,
                temperature=0.2
            )
        )
        
        # The response text will be a JSON string conforming to the schema
        diagram_data = json.loads(response.text)
        return jsonify(diagram_data)
        
    except Exception as e:
        print(f"Gemini API error: {e}")
        return jsonify({"error": f"Failed to generate diagram: {e}"}), 500

# --- STATIC FILE ROUTE (Serves your index.html) ---
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'system-design.html')

@app.route('/<filename>')
def serve_static_asset(filename):
    # This route is correct for serving System_style.css and other assets
    return send_from_directory(app.static_folder, filename)

if __name__ == '__main__':
    # Use 0.0.0.0 for compatibility, debug=True for auto-reloading during development
    app.run(host='0.0.0.0', port=5000, debug=True)