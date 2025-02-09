import os
import httpx
import json
import re
import ast
import logging
import sympy as sp
import matplotlib
import matplotlib.pyplot as plt
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Union, List
import base64
import io

# Use non-interactive Matplotlib backend
matplotlib.use('Agg')

# Load environment variables
load_dotenv()

# API Credentials
API_KEY = os.getenv("KEY")
MODEL_ID = os.getenv("ID", "gemma2-9b-it")
GROQ_API_URL = os.getenv("URL")

# System Prompt
SYSTEM = os.getenv("SYSTEM")

GRAPH_SYSTEM = os.getenv("GRAPH")

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Schemas
class QuestionRequest(BaseModel):
    question: str
    messages: list

class GraphRequest(BaseModel):
    content: Union[str, List[str]]


# Summarize Conversation
def summarize_conversation(messages):
    if len(messages) > 6:
        return messages[1:]
    return messages


# Safe API Request
def send_groq_request(messages: list, is_graph=False):
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    if not is_graph:
        messages.insert(0, {"role": "system", "content": SYSTEM})
    else:
        messages.insert(0, {"role": "system", "content": GRAPH_SYSTEM})

    payload = {
        "model": MODEL_ID,
        "messages": messages,
        "temperature": 0.5,
        "max_tokens": 1500,
        "response_format": {"type": "json_object"}
    }

    try:
        response = httpx.post(GROQ_API_URL, headers=headers, json=payload, timeout=10.0)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Request error: {e}")


# JSON Parsing
def force_json_parse(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except json.JSONDecodeError as e:
                raise ValueError(f"Extracted JSON is invalid: {e}")
        try:
            return ast.literal_eval(text)
        except Exception:
            raise ValueError("No valid JSON could be extracted from the response.")


# Clean AI Response
def clean_response_text(text):
    if not isinstance(text, str):
        return text
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


# **Safe Function Evaluation Using SymPy**
def evaluate_function(expression):
    try:
        # Remove any "np." occurrences to let sympy correctly parse the function name.
        cleaned_expression = expression.replace("np.", "")
        x = sp.symbols("x")
        parsed_expr = sp.sympify(cleaned_expression)
        return sp.lambdify(x, parsed_expr, modules="numpy")
    except Exception as e:
        raise Exception(f"Invalid function: {e}")



# **Generate Base64 Image (Optional)**
def render_graph_with_matplotlib_base64(
        function_strs: list,
        graph_config: dict,
        styling: dict
) -> str:
    # logging.error(f"Rendering graph for functions: {function_strs}")
    plt.figure(figsize=(10, 7))

    # Extract configuration
    x_min, x_max = graph_config.get('x_range', [-10, 10])
    y_min, y_max = graph_config.get('y_range', [-10, 10])
    grid_spacing = graph_config.get('grid_spacing', 1)
    grid_spacing = 1

    # Create coordinate points
    x = np.linspace(x_min, x_max, 1000)

    # Get styling options
    colors = styling.get('colors', ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd'])
    line_styles = styling.get('line_styles', ['solid'] * len(function_strs))
    line_width = 1

    # Plot each function
    for i, function_str in enumerate(function_strs):
        try:
            f = evaluate_function(function_str)
            y = f(x)

            # Apply y-range limits
            y = np.clip(y, y_min, y_max)

            # Get color and style for this function
            color = colors[i % len(colors)]
            style = line_styles[i % len(line_styles)]

            plt.plot(x, y,
                     label=f"{function_str}",
                     linewidth=line_width,
                     linestyle=style,
                     color=color)

        except Exception as e:
            logging.error(f"Error plotting function {function_str}: {e}")
            raise HTTPException(status_code=400, detail=f"Error plotting function {function_str}: {e}")

    # Set up coordinate system
    ax = plt.gca()

    # Configure spines
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_position('zero')
    ax.spines['bottom'].set_position('zero')

    # Set axis limits
    plt.xlim(x_min, x_max)
    plt.ylim(y_min, y_max)

    # Add grid with specified spacing
    plt.grid(True, linestyle='--', alpha=0.7)
    ax.set_xticks(np.arange(x_min, x_max + grid_spacing, grid_spacing))
    ax.set_yticks(np.arange(y_min, y_max + grid_spacing, grid_spacing))

    # Add arrows to axes
    arrow_props = dict(
        arrowstyle="->",
        color='black',
        linewidth=1.5,
        mutation_scale=15
    )

    # Add axis arrows
    plt.annotate("", xy=(x_max, 0), xytext=(x_max - 0.5, 0),
                 arrowprops=arrow_props)
    plt.annotate("", xy=(0, y_max), xytext=(0, y_max - 0.5),
                 arrowprops=arrow_props)

    # Add minimal legend with only function equations
    plt.legend(loc='best', framealpha=0.9, facecolor='white')

    # Remove all text from axes
    ax.set_xticklabels([])
    ax.set_yticklabels([])

    # Save to base64
    buf = io.BytesIO()
    plt.savefig(buf,
                format="png",
                bbox_inches='tight',
                dpi=100,
                facecolor='white',
                edgecolor='none',
                pad_inches=0.1)
    plt.close()
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode("utf-8")
    return f"data:image/png;base64,{img_base64}"


# **Main API Endpoints**
@app.post("/ask")
def ask_question(request: QuestionRequest):
    try:
        messages = summarize_conversation(request.messages)
        messages[-1]['content'] += '\n . Но не забывай, что ты помощник по математике и только математике'

        response = send_groq_request(messages)
        response_text = clean_response_text(response["choices"][0]["message"]["content"])
        json_response = force_json_parse(response_text)

        final_answer = {
            "status": "success",
            "whiteboard": json_response.get("widgets", []),
            "answer": json_response.get("answer", "No response available."),
        }
        whiteboard = final_answer['whiteboard']
        whiteboard_index = -1
        if len(whiteboard) > 0:
            whiteboard_index = 0 if whiteboard[0].get('type') == 'defineWhiteboard' else -1
        if len(whiteboard) > 1:
            whiteboard_index = 1 if whiteboard[1].get('type') == 'defineWhiteboard' else -1
        if whiteboard_index >= 0:
            whiteboard_content = final_answer['whiteboard'][whiteboard_index]['parameters']['content']
            if whiteboard_content:
                messages.append({
                    "role": "assistant",
                    "content": f"Whiteboard content:\n{whiteboard_content}"
                })

        return final_answer
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/render_graph")
async def render_graph_endpoint(request: GraphRequest):
    try:
        # Convert input to list if it's a single string
        functions = request.content if isinstance(request.content, list) else [request.content]

        # Prepare message for the AI model
        graph_request = [# Use the prompt we created above
            {"role": "user", "content": f"Generate visualization parameters for these functions: {functions}"}
        ]

        # Get AI response
        response = send_groq_request(graph_request, is_graph=True)
        config = json.loads(response["choices"][0]["message"]["content"])

        # Use the configuration to generate the graph
        base64_image = render_graph_with_matplotlib_base64(
            function_strs=functions,
            graph_config=config["graph_config"],
            styling=config["styling"]
        )

        return {
            "status": "success",
            "image": base64_image,
            "config": config  # Optional: return the configuration for debugging
        }
    except Exception as e:
        logging.error(f"Graph generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))