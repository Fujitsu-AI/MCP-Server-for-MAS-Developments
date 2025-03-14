import asyncio
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import List

import anyio
import gradio as gr
import httpx
from openai import OpenAI

from agents.AgentInterface.Python.config import Config, ConfigError
from agents.OpenAI_Compatible_API_Agent.Python.open_ai_helper import num_tokens
from clients.Gradio.Api import PrivateGPTAPI
from clients.Gradio.mcp_client import MCPClient
from mcpcli.config import load_config
from mcpcli.messages.send_initialize_message import send_initialize
from mcpcli.transport.stdio.stdio_client import stdio_client

# Dummy credentials for demonstration purposes
USERNAME = "user"
PASSWORD = "pass"

server_url = "http://127.0.0.1:3001/sse"
server_script = "./dist/demo-mcp-server/demo-tools-stdio.js"

# Konfiguration laden
try:
    config_file = Path.absolute(Path(__file__).parent / "config.json")
    config = Config(config_file=config_file, required_fields=["base_url"])
    default_groups = config.get("groups", [])
    vllm_url =  config.get("vllm_url", "")
    vllm_api_key = config.get("vllm_api_key", "")
except ConfigError as e:
    print(f"Configuration Error: {e}")
    exit(1)

mcp_client = MCPClient(vllm_url, vllm_api_key)

user_data_source = ["User1", "User2", "User3", "User4", "User5"]
pgpt = None
selected_groups = []
tools = []

# Function to handle login logic
async def login(username, password, selected_options):
    global pgpt
    config.set_value("email", username)
    config.set_value("password", password)
    pgpt = PrivateGPTAPI(config)
    if pgpt.logged_in:
        # Successful login
        groups = pgpt.list_personal_groups()

        return gr.update(visible=False), gr.update(visible=True), "", gr.update(choices=groups, value=None)
    else:
        return gr.update(), gr.update(visible=False), "Invalid credentials. Please try again.", gr.update(choices=[], value=None)


async def init_mcp_sse(server_url):
    global tools
    #todo make this configurable

    try:
        await mcp_client.connect_to_sse_server(server_url=server_url)
        response = await mcp_client.session.list_tools()
        tools = []
        for tool in response.tools:
            try:
                print(tool)
                tools.append(
                    {
                        "type": "function",
                        "function": {
                            "name": tool.name,
                            "description": tool.description,
                            "parameters": tool.inputSchema
                        }
                    }
                )
            except Exception as e:
                print(e)

    except:
        print("error connecting to MCP SSE server")
    #finally:
    #    await client.cleanup()

async def init_mcp_stdio(server_script):
    global tools
    #todo make this configurable
    print("Init Stdio")
    try:

        await mcp_client.connect_to_stdio_server(server_script)
        response = await mcp_client.session.list_tools()
        tools = []
        for tool in response.tools:
            try:
                print(tool)
                tools.append(
                    {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.inputSchema
                        }
                     }
                )
            except Exception as e:
                print(e)

        print(tools)

    except:
        print("error connecting to MCP Stdio server")
    #finally:
    #    await client.cleanup()


def show_image(img):
    return img


async def create_interface():
    with gr.Blocks(theme="ocean",  css="footer {visibility: hidden}") as demo:
        # Login UI Elements
        login_message = gr.Markdown("")

        #await init_mcp_sse(server_url)
        await init_mcp_stdio(server_script = "./dist/demo-mcp-server/demo-tools-stdio.js")

        with gr.Group() as login_interface:

            get_local_storage = """
                function() {
                  globalThis.setStorage = (key, value)=>{
                    localStorage.setItem(key, JSON.stringify(value))
                  }
                   globalThis.getStorage = (key, value)=>{
                    return JSON.parse(localStorage.getItem(key))
                  }
                   const username_input =  getStorage('login')
                   const password_input =  getStorage('password')
                   return [username_input, password_input];
                  }
                """


            gr.Image(value="./clients/Gradio/logos/Logo_dark.svg", show_label=False,
                     show_download_button=False,
                     show_fullscreen_button=False, height=200)

            username_input = gr.Textbox(label="Username")
            username_input.change(None, username_input, None, js="(v)=>{ setStorage('login',v) }")
            password_input = gr.Textbox(label="Password", type="password")
            password_input.change(None, password_input, None, js="(v)=>{ setStorage('password',v) }")

            login_button = gr.Button("Login")

            #local_data = gr.JSON({}, label="Local Storage")
            with gr.Blocks() as block:
                block.load(
                    None,
                    inputs=None,
                    outputs=[username_input, password_input],
                    js=get_local_storage,
                )


            saved_message = gr.Markdown("✅ Saved to local storage", visible=False)

        # Dashboard UI Elements
        with gr.Group(visible=False) as dashboard_interface:
            with gr.Blocks(theme="ocean",  css="footer {visibility: hidden}"):
                with gr.Tab("Chat"):
                    async def predict(message, history):
                        global selected_groups
                        global tools

                        history_openai_format = []
                        for human, assistant in history:
                            history_openai_format.append({"role": "user", "content": human})
                            history_openai_format.append({"role": "assistant", "content": assistant})
                        history_openai_format.append({"role": "user", "content": message})

                        if len(selected_groups) == 0:
                            # If we don't use a group, we use vllm directly.

                            client = OpenAI(
                                base_url=vllm_url,
                                api_key=vllm_api_key,
                                http_client=httpx.Client(verify=False)
                            )
                            #mcp_client.process_query(history_openai_format)

                            completion = client.chat.completions.create(
                                model="/models/mistral-nemo-12b",
                                messages=history_openai_format,
                                temperature=1.0,
                                tools = tools or None,
                                stream=False
                            )

                            # Process response and handle tool calls
                            tool_results = []
                            final_text = []

                            message = completion.choices[0].message
                            print(message)
                            tool_calls = []

                            # Convert Ollama tool calls to OpenAI format
                            if hasattr(message, "tool_calls") and message.tool_calls:
                                for tool in message.tool_calls:
                                    print(tool.function.arguments)
                                    tool_calls.append(
                                        {
                                            "id": str(uuid.uuid4()),  # Generate unique ID
                                            "type": "function",
                                            "function": {
                                                "name": tool.function.name,
                                                "arguments": tool.function.arguments,
                                            },
                                        }
                                    )
                            if tool_calls:
                                for tool_call in tool_calls:
                                    # Extract tool_name and raw_arguments as before
                                    tool_call_id = str(uuid.uuid4())
                                    if hasattr(tool_call, "id"):
                                        tool_call_id = str(tool_call.id)

                                    if hasattr(tool_call, "function"):
                                        print(tool_call.function)
                                        tool_name = getattr(tool_call.function, "name", "unknown tool")
                                        raw_arguments = getattr(tool_call.function, "arguments", {})

                                    elif isinstance(tool_call, dict) and "function" in tool_call:
                                        fn_info = tool_call["function"]
                                        tool_name = fn_info.get("name", "unknown tool")
                                        raw_arguments = fn_info.get("arguments", {})
                                    else:
                                        tool_name = "unknown tool"
                                        raw_arguments = {}

                                    # If raw_arguments is a string, try to parse it as JSON
                                    if isinstance(raw_arguments, str):
                                        try:
                                            raw_arguments = json.loads(raw_arguments)
                                        except json.JSONDecodeError:
                                            # If it's not valid JSON, just display as is
                                            pass

                                    # Now raw_arguments should be a dict or something we can pretty-print as JSON
                                    tool_args_str = json.dumps(raw_arguments, indent=2)


                                    print(
                                        f"**Tool Call:** {tool_name}\n\n```json\n{tool_args_str}\n```"
                                    )
                                    tool_message =  f"**Tool Call:** {tool_name}\n\n```json\n{tool_args_str}\n```"
                                    tokens = tool_message.split(" ")
                                    partial_message = ""
                                    for i, token in enumerate(tokens):
                                        partial_message = partial_message + token + " "
                                        await asyncio.sleep(0.05)
                                        yield partial_message

                                    meta = await mcp_client.call_tool(tool_name, raw_arguments)
                                    print(meta)
                                    print("Tool " + tool_name + " reply: " + str(meta.content[0]))

                                    tool_results.append({"call": str(tool_name), "result": meta.content})
                                    # final_text.append(f"[Calling tool {tool_name} with args {raw_arguments}]")

                                    history_openai_format.append(
                                        {
                                            "role": "assistant",
                                            "content": None,
                                            "tool_calls": [
                                                {
                                                    "id": tool_call_id,
                                                    "type": "function",
                                                    "function": {
                                                        "name": tool_name,
                                                        "arguments": json.dumps(raw_arguments)
                                                        if isinstance(raw_arguments, dict)
                                                        else raw_arguments,
                                                    },
                                                }
                                            ],
                                        }
                                    )

                                    # Continue conversation with tool results
                                    if hasattr(meta.content[0], 'text') and meta.content[0].text:
                                        history_openai_format.append(
                                            {
                                                "role": "tool",
                                                "name": tool_name,
                                                "content": str(meta.content[0].text),
                                                "tool_call_id": tool_call_id,
                                            }
                                        )

                                    # Get next response from Claude
                                    response = mcp_client.client.chat.completions.create(
                                        model="/models/mistral-nemo-12b",
                                        messages=history_openai_format,
                                        temperature=1.0,
                                        stream=False
                                    )

                                    # final_text.append("LLM reply: " +response.choices[0].message.content)
                                    partial_message = ""
                                    tokens = response.choices[0].message.content.split(" ")
                                    for i, token in enumerate(tokens):
                                        partial_message = partial_message + token + " "
                                        await asyncio.sleep(0.05)
                                        yield partial_message



                            else:
                                partial_message = ""
                                tokens = message.content.split(" ")
                                for i, token in enumerate(tokens):
                                    partial_message = partial_message + token + " "
                                    await asyncio.sleep(0.05)
                                    yield partial_message


                            #for chunk in completion:
                            #    if len(chunk.choices[0].delta.content) != 0:
                            #        partial_message = partial_message + chunk.choices[0].delta.content
                            #        yield partial_message



                        else:
                            config.set_value("groups", selected_groups)
                            pgpt = PrivateGPTAPI(config)
                            # otherwise we use the api code to use the rag.
                            response = pgpt.respond_with_context(history_openai_format)
                            print(response)
                            user_input = ""
                            for message in history_openai_format:
                                user_input += json.dumps(message)

                            num_tokens_request, num_tokens_reply, num_tokens_overall = num_tokens(user_input,response["answer"])

                            tokens = response["answer"].split(" ")
                            partial_message = ""
                            for i, token in enumerate(tokens):
                                chunk = {
                                    "id": i,
                                    "object": "chat.completion.chunk",
                                    "created": time.time(),
                                    "model": "/models/mistral-nemo-12b",
                                    "choices": [{"delta": {"content": token + " "}}],
                                    "usage": {
                                        "prompt_tokens": num_tokens_request,
                                        "completion_tokens": num_tokens_reply,
                                        "total_tokens": num_tokens_overall
                                    }
                                }


                                partial_message = partial_message + token + " "
                                await asyncio.sleep(0.05)
                                yield partial_message

                            yield response["answer"]


                            #yield "data: [DONE]\n\n"




                    def change_group(selected_item):
                        global selected_groups
                        selected_groups = selected_item

                    groupslist = gr.CheckboxGroup(choices=[], label="Groups")
                    groupslist.change(change_group, groupslist, None)


                    gr.ChatInterface(predict,
                                     chatbot=gr.Chatbot(height=500, show_label=False),
                                     type='tuples',
                                     textbox=gr.Textbox(placeholder="Ask me a question", container=True, scale=7),
                                     theme="ocean",
                                     examples=["Hello", "Write a Python function that counts all numbers from 1 to 10",
                                               "Are tomatoes vegetables?"],
                                     cache_examples=False)


                # Other Functions, todo
                #with gr.Tab("Sources"):
                #    gr.Markdown("Test function, not working.")

                #    def upload_file(file):
                #        UPLOAD_FOLDER = "./data"
                #        if not os.path.exists(UPLOAD_FOLDER):
                #            os.mkdir(UPLOAD_FOLDER)
                #        shutil.copy(file, UPLOAD_FOLDER)
                #        gr.Info("File Uploaded!!!")

                #    upload_button = gr.UploadButton("Click to Upload a File")
                #    upload_button.upload(upload_file, upload_button)

                #with gr.Tab("Users"):
                    # Initial data source
                #    gr.Markdown("Test function, not working.")
                    # TODO Api.. how do we get users?

                    # Function to remove selected option from the dropdown
                #    def remove_option(selected_option, options):
                #        if selected_option in options:
                #            options.remove(selected_option)
                #        return options, gr.update(choices=options, value=None)  # Reset selection

                    # Function to update the options by removing the selected ones
               #     def update_options(selected_options):
               #         global user_data_source
               #         # Filter out selected options
               #         user_data_source = [option for option in user_data_source if option not in selected_options]
               #         # TODO delete others from db
               #        for element in selected_options:
               #             print("todo: delete from db")
               #         selected_options = []

               #         return gr.update(choices=user_data_source, value=None)  # Return the updated choices

                    # Gradio Interface: Create blocks to lay out components
                #    with gr.Blocks() as demo2:
                #        global user_data_source

                        # Define a CheckboxGroup which we may need to dynamically update
                #        checkbox = gr.CheckboxGroup(choices=user_data_source, label="Options")
                #        remove_button = gr.Button("Remove User")

                        # Connect button click to update function, modifying the choices in CheckboxGroup
                #        remove_button.click(fn=update_options, inputs=checkbox, outputs=checkbox)

        # Connect button to function and update components accordingly
        login_button.click(
            fn=login,
            inputs=[username_input, password_input, groupslist],
            outputs=[login_interface, dashboard_interface, login_message, groupslist]
        )


    demo.launch()


asyncio.run(create_interface())