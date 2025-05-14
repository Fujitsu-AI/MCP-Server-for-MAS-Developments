import asyncio
import base64
import gzip
import io
import json
import os
import random
import shutil
import time
import uuid
from datetime import datetime
from pathlib import Path

import gradio as gr
import httpx
import numpy as np
import pandas as pd
import requests
from PIL.PngImagePlugin import PngImageFile
from gradio import FileData
from gradio_modal import Modal
from openai import OpenAI

from agents.AgentInterface.Python.config import Config, ConfigError
from clients.Gradio.Api import PrivateGPTAPI
from clients.Gradio.file_tools.loader_factory import LoadersFactory
from clients.Gradio.mcp_client import MCPClient, generate_system_prompt, load_config, clean_response
from clients.Gradio.messages.send_call_tool import send_call_tool
from clients.Gradio.messages.send_initialize_message import send_initialize
from clients.Gradio.messages.send_tools_list import send_tools_list
from clients.Gradio.transport.stdio.stdio_client import stdio_client


# config
mcp_config = "./clients/Gradio/server_config.json"

#selection of mcp servers from the config
server_names = ["demo-tools", "filesystem", "sqlite", "nostr",  "agent_web_search", "hf_flux", "analyze_image"] #"google-calendar"] #
# if all_mcp_servers is True, the above list will be overwritten and all servers in the config will be considered
all_mcp_servers = False

temperature = 0.8
top_p = 0.8
model = "/models/mistral-nemo-12b"
md_model = None



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

if all_mcp_servers:
    with open(mcp_config, 'r') as f:
        server_names = list(json.load(f)['mcpServers'].keys())
        print(server_names)




mcp_servers = []

#user_data_source = ["User1", "User2", "User3", "User4", "User5"]
selected_groups = []
pgpt = None

# Function to handle login logic
async def login(username, password, selected_options, selected_options2):
    global pgpt
    config.set_value("email", username)
    config.set_value("password", password)
    pgpt = PrivateGPTAPI(config)
    if pgpt.logged_in:
        # Successful login
        groups = pgpt.list_personal_groups()
        return gr.update(visible=False), gr.update(visible=True), "", gr.update(choices=groups, value=None), gr.update(choices=groups, value=None)
    else:
        gr.Warning("Error connecting.")
        return gr.update(), gr.update(visible=False), "Invalid credentials. Please try again.", gr.update(choices=[], value=None), gr.update(choices=[], value=None)



MAX_ITEMS = 200  # Max number of sources




def delete_source(sources, index):
    if 0 <= index < len(sources):
        source_to_delete = sources[index]
        print(source_to_delete)
        status = pgpt.delete_source(source_to_delete["id"])
        if status == "success":
            gr.Success("Entry deleted")
        else:
            gr.Error("Failed")
        sources.pop(index)

    return sources

def render_ui(sources):
    updates = []
    for i in range(MAX_ITEMS):
        if i < len(sources):
            src = sources[i]
            updates.extend([
                gr.update(visible=True),                # Row visible
                gr.update(value=src["name"]),           # Name
                gr.update(value="\n".join(src["groups"])),         # Groups
                gr.update(value=src["creator"]),        # Creator
                gr.update(value=src["date"]),           # Date
                gr.update(value=src["status"]),         # Status
                gr.update(visible=True),                # Delete button visible
            ])
        else:
            updates.extend([
                gr.update(visible=False),
                gr.update(value=""),
                gr.update(value=""),
                gr.update(value=""),
                gr.update(value=""),
                gr.update(value="Draft"),
                gr.update(visible=False),
            ])
    return updates





async def init_mcp_stdio(mcp_config, server_names):
    try:
        for server_name in server_names:
            mcp_client = MCPClient(vllm_url, vllm_api_key)
            server_params = await load_config(mcp_config, server_name)
            try:
                await mcp_client.connect_to_stdio_server(server_params, server_name)



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

                mcp_servers.append((mcp_client, tools, server_name))
            except Exception as e:
                print(e)

    except Exception as e:
        print(e)
        print("error connecting to MCP Stdio server")
    #finally:
    #    await client.cleanup()


def show_image(img):
    return img

def transcribe_whisper(file_path):
    from faster_whisper import WhisperModel

    model_size = "base"

    # Run on GPU with FP16
    # model = WhisperModel(model_size, device="cuda", compute_type="float16")

    # or run on GPU with INT8
    # model = WhisperModel(model_size, device="cuda", compute_type="int8_float16")
    # or run on CPU with INT8
    whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")

    segments, info = whisper_model.transcribe(file_path, beam_size=5)

    print("Detected language '%s' with probability %f" % (
        info.language, info.language_probability))
    message = ""
    for segment in segments:
        print("[%.2fs -> %.2fs] %s" % (segment.start, segment.end, segment.text))
        message += segment.text + "\n"

    return message.rstrip("\n")

def process_image(message, file_path):
    import moondream as md
    from PIL import Image
    global md_model

    # todo check if model exists, download on demand. make model selectable.
    if md_model is None:
        # md_model = md.vl(model="./clients/Gradio/models/moondream-0_5b-int8.mf")

        # URL of the zip file
        zip_url = 'https://huggingface.co/vikhyatk/moondream2/resolve/9dddae84d54db4ac56fe37817aeaeb502ed083e2/moondream-2b-int8.mf.gz?download=true'

        # Folder to extract into
        extract_to = './clients/Gradio/models'

        # Target file to check
        target_file = os.path.join(extract_to, 'moondream-2b-int8.mf')

        # Only proceed if the target file doesn't exist
        if not os.path.exists(target_file):
            print("moondream-2b-int8.mf not found. Downloading and extracting...")
            # Make sure the extraction folder exists
            os.makedirs(extract_to, exist_ok=True)

            # Download the zip
            response = requests.get(zip_url)
            response.raise_for_status()

            # Extract it
            # Decompress and write the file
            with gzip.open(io.BytesIO(response.content), 'rb') as f_in:
                with open(target_file, 'wb') as f_out:
                    f_out.write(f_in.read())

            print(f"Done! Extracted to: {extract_to}")

        md_model = md.vl(model="./clients/Gradio/models/moondream-2b-int8.mf")

    # Load and process image
    image = Image.open(file_path)
    encoded_image = md_model.encode_image(image)

    # Generate caption
    # caption = model.caption(encoded_image)["caption"]
    # print("Caption:", caption)

    # Ask questions
    result = md_model.query(encoded_image, message)["answer"]
    print("Answer:", result)
    return result


async def create_interface():
    theme = gr.themes.Default(primary_hue="blue").set(
        loader_color="#FF0000",
        slider_color="#FF0000",
    )
    with (gr.Blocks(theme="ocean",
                   title="PrivateGPT MCP Multi-API Demo",
                   fill_height=True,
                   #css="footer{display:none !important}"
                   css="footer {visibility: hidden}"


                    )
          as demo):
        # Login UI Elements
        login_message = gr.Markdown("")

        await init_mcp_stdio(mcp_config=mcp_config, server_names=server_names)



        with gr.Group() as login_interface:
            # Store/Save credentials in browser
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

            with gr.Row():
                gr.Image(value="./clients/Gradio/logos/Logo_dark.svg", show_label=False,
                         show_download_button=False,
                         show_fullscreen_button=False, height=300, width=200, scale=1)
                gr.Image(value="./clients/Gradio/logos/fsas.png", show_label=False,
                         show_download_button=False,
                         show_fullscreen_button=False, height=300, scale=3)
            username_input = gr.Textbox(label="Username")
            username_input.change(None, username_input, None, js="(v)=>{ setStorage('login',v) }")
            password_input = gr.Textbox(label="Password", type="password")
            password_input.change(None, password_input, None, js="(v)=>{ setStorage('password',v) }")

            login_button = gr.Button("Login")

            with gr.Blocks() as vl:
                vl.load(
                    None,
                    inputs=None,
                    outputs=[username_input, password_input],
                    js=get_local_storage,
                )


            saved_message = gr.Markdown("✅ Saved to local storage", visible=False)

        # Dashboard UI Elements
        with gr.Group(visible=False) as dashboard_interface:

            with gr.Blocks() as main:
                with gr.Tab("Chat"):
                    async def predict(message, history):
                        global selected_groups
                        global mcp_servers
                        global temperature
                        global top_p
                        global model
                        global md_model

                        files = []
                        # deal with multimodal textfield
                        try:
                            files = message["files"]
                            message = str(message["text"])
                        except:
                            print("using regular message")


                        if len(files) > 0:
                            for file_path in files:
                                print(file_path)
                                # Get the file extension
                                file_extension = os.path.splitext(file_path)[1]
                                print(f"File Extension: {file_extension}")

                                if file_extension == ".wav":
                                   message = transcribe_whisper(file_path)

                                elif file_extension == ".jpg" or file_extension == ".jpeg" or file_extension == ".png" or file_extension == ".bmp":
                                    message = "analyze this image: prompt: " + message + " filepath: " + file_path
                                    #result = process_image(message, file_path)
                                    #result = [{"role": "assistant", "content": str(result)}]
                                    #yield result
                                    #return

                                else:

                                    content = ""
                                    if file_extension == ".pdf":
                                        content = LoadersFactory().pdf(file_path)
                                    elif file_extension == ".csv":
                                        content = LoadersFactory().csv(file_path)
                                    elif file_extension == ".xlsx":
                                        content = LoadersFactory().xlsx(file_path)
                                    elif file_extension == ".md":
                                        content = LoadersFactory().markdown(file_path)
                                    # todo add more sources

                                    markdown = LoadersFactory().convert_documents_to_markdown(content)
                                    print(markdown)
                                    message += "\n\n" + markdown


                        history_openai_format = []
                        tools = []
                        file_extension = ""
                        if len(files) > 0:
                            file_extension = os.path.splitext(files[0])[1]
                        # only add mcp servers when we don't have a file attached for now.
                        if len(files) == 0  or len(files) == 1 and (file_extension == ".wav" or  file_extension == ".jpg" or file_extension == ".jpeg" or file_extension == ".png" or file_extension == ".bmp"):
                            for mcp_server, mcptools, mcpname in mcp_servers:
                                for tool in mcptools:
                                    tools.append(tool)




                        if len(selected_groups) == 0:
                            # If we don't use a group, we use vllm directly.

                            # only make the mcp prompt when we don't have a file attached
                            if len(files) == 0 or len(files) == 1 and os.path.splitext(files[0])[1] == ".wav":
                                system_prompt = generate_system_prompt(tools)

                            else:
                                system_prompt = "You have access to a document. The user will instruct you what to do with it."

                            history_openai_format.append({"role": "system", "content": system_prompt})


                            last_role = "system"
                            for entry in history:
                                if last_role != entry["role"] and not hasattr(entry, "tool_calls") or  (hasattr(entry, "tool_calls") and (entry["tool_calls"] is None  or entry["tool_calls"] == [])):
                                    history_openai_format.append({"role": entry["role"], "content": str(entry["content"])})
                                    last_role = entry["role"]

                            history_openai_format.append({"role": "user", "content": message})

                            print(history_openai_format)

                            client = OpenAI(
                                base_url=vllm_url,
                                api_key=vllm_api_key,
                                http_client=httpx.Client(verify=False)
                            )


                            completion = client.chat.completions.create(
                                model=model,
                                messages=history_openai_format,
                                temperature=temperature,
                                top_p=top_p,
                                tools = tools or None,
                                stream=False
                            )

                            # Process response and handle tool calls
                            tool_results = []

                            result = completion.choices[0].message
                            print(result)
                            tool_calls = []

                            # work around the mistral llm weirdness
                            other_weird_stuff = str(result.content).lstrip().replace("[\n```", "```").replace("{\n```", "```")
                            if result.content is not None or other_weird_stuff.startswith('```'):
                                if result.content.startswith("[TOOL_CALLS]") or other_weird_stuff.startswith("```") :
                                    print("entering TOOL_CALLS")
                                    time.ctime()  # 'Mon Oct 18 13:35:29 2010'
                                    current_timestamp = time.time()
                                    formatted_timestamp = time.strftime("%Y-%m-%d %H:%M:%S",
                                                                        time.localtime(current_timestamp))
                                    system_prompt = "The timezone is Europe/Berlin. This is the CURRENT DATE: " + formatted_timestamp

                                    history_openai_format = [{"role": "system", "content": system_prompt},
                                                             {"role": "user", "content": message}]


                                    #history_openai_format = [{"role": "user", "content": message}]
                                    completion = client.chat.completions.create(
                                        model=model,
                                        messages=history_openai_format,
                                        temperature=temperature,
                                        top_p=top_p,
                                        tools=tools or None,
                                        stream=False
                                    )
                                    tool_results = []

                                    result = completion.choices[0].message
                                    print(message)
                                    tool_calls = []

                            # Convert tool calls to OpenAI format
                            if hasattr(result, "tool_calls") and result.tool_calls:
                                for tool in result.tool_calls:
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
                                            print("error json not valid")
                                            # If it's not valid JSON, just display as is
                                            pass

                                    # Now raw_arguments should be a dict or something we can pretty-print as JSON
                                    tool_args_str = json.dumps(raw_arguments, indent=2)

                                    tool_message =  f"```json\n{tool_args_str}\n```"
                                    print(tool_message)


                                    yield [
                                        {
                                            "role": "assistant",
                                            "content": "\n" + tool_message + "\n",
                                            "metadata": {"title": f"🛠️ Using tool {tool_name}",
                                                         "status": "pending"}
                                        },

                                    ]

                                    for mcp_server, tools, name in mcp_servers:
                                        if tool_name in str(tools): #todo: better check
                                            print(tool_name + " in tools")

                                            meta = await call_tool(mcp_server.name, tool_name, raw_arguments)
                                            if meta is None:
                                                return

                                            content = meta.get('content', [])
                                            print("Tool " + tool_name + " reply: " + str(content))

                                            tool_results.append({"call": str(tool_name), "result": content})

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

                                            if  len(content)> 0 and content[0].get("type") == "text" and content[0].get("text") is not None:

                                                #temporary workaround, move to image instead of text

                                                content = content[0].get("text")
                                                isimagejson = False
                                                j = None
                                                try:
                                                    j = json.loads(content)
                                                    if j.get("type") == "image":
                                                        isimagejson = True
                                                except:
                                                    isimagejson = False

                                                if isimagejson:

                                                    yield  [
                                                        {
                                                            "role": "assistant",
                                                            "content": "\n" + tool_message + "\n" + f"Reply:\n {content}" + "\n",
                                                            "tool_calls": [tool_name],
                                                            "metadata": {"title": f"🛠️ Used tool {tool_name}",
                                                                         "status": "done"}
                                                        },
                                                        {
                                                            "role": "assistant",
                                                            "content":  f"{j.get("message")}:\n![Image Description]({j.get("url")})"
                                                        }

                                                    ]

                                                else:

                                                    history_openai_format.append(
                                                        {
                                                            "role": "tool",
                                                            "name": tool_name,
                                                            "content": content,
                                                            "tool_call_id": tool_call_id,
                                                        }
                                                    )

                                                    response = client.chat.completions.create(
                                                        model=model,
                                                        messages=history_openai_format,
                                                        temperature=temperature,
                                                        top_p=top_p,
                                                        stream=False
                                                    )

                                                    partial_mes = ""
                                                    #history.append({"role": "assistant", "content": "I called a tool",
                                                    #                     "metadata": {"title": f"🛠️ Used tool {"Test"}"}})
                                                    tokens = clean_response(response.choices[0].message.content).split(" ")
                                                    for i, token in enumerate(tokens):
                                                        partial_mes = partial_mes + token + " "
                                                        await asyncio.sleep(0.05)
                                                        yield partial_mes
                                                    #history.append({"role": "assistant", "content": clean_response(response.choices[0].message.content)})

                                                    yield [
                                                            {
                                                                "role": "assistant",
                                                                "content": "\n" + tool_message + "\n" + f"Reply:\n {content}" + "\n",
                                                                "tool_calls": [tool_name],
                                                                "metadata": {"title": f"🛠️ Used tool {tool_name}",
                                                                             "status": "done"}
                                                            },
                                                            {
                                                                "role": "assistant",
                                                                "content": clean_response(response.choices[0].message.content)
                                                            },


                                                        ]

                                                    break
                                            elif len(content)> 0 and content[0].get("type") == "image":
                                                try:
                                                    base64_string = content[0].get("data")
                                                    image_bytes = base64.b64decode(base64_string)

                                                    from PIL import Image as PilImage
                                                    pil_image = PilImage.open(io.BytesIO(image_bytes))

                                                    pil_image.save("test.jpg")
                                                    fullpath = Path("test.jpg").absolute()
                                                    print(fullpath)


                                                    yield [ {
                                                            "role": "assistant",
                                                            "content": "\n" + tool_message + "\n",
                                                            "tool_calls": [tool_name],
                                                            "metadata": {"title": f"🛠️ Used tool {tool_name}",
                                                                         "status": "done"}
                                                        },
                                                        {
                                                        "text": content[0].get("message"),
                                                        "files" : [fullpath]
                                                        }

                                                    ]

                                                    #yield [
                                                    #    {
                                                    #        "role": "assistant",
                                                    #        "content": "\n" + tool_message + "\n" + f"Reply:\n {content}" + "\n",
                                                    #        "tool_calls": [tool_name],
                                                    #        "metadata": {"title": f"🛠️ Used tool {tool_name}",
                                                    #                     "status": "done"}
                                                    #    },
                                                    #    {
                                                    #        "role": "assistant",
                                                    #        "content": f"![Image Description](file:///{fullpath})"
                                                    #    }


                                                    #]
                                                except Exception as e:
                                                    print(e)
                                                    yield [
                                                        {
                                                            "role": "assistant",
                                                            "content": "\n" + tool_message + "\n" + f"Reply:\n {content}" + "\n",
                                                            "tool_calls": [tool_name],
                                                            "metadata": {"title": f"🛠️ Used tool {tool_name}",
                                                                         "status": "done"}
                                                        },
                                                        {
                                                            "role": "assistant",
                                                            "content": "Error receiving an image"
                                                        }

                                                    ]


                            else:
                                partial_mes = ""
                                tokens = clean_response(result.content).split(" ")
                                for i, token in enumerate(tokens):
                                    partial_mes = partial_mes + token + " "
                                    await asyncio.sleep(0.05)
                                    yield partial_mes


                        else:
                            # if at least one group is seleceted we use the api code to use the rag.

                            last_role = "system"
                            for entry in history:
                                if last_role != entry["role"]:
                                    history_openai_format.append({"role": entry["role"], "content": entry["content"]})
                                    last_role = entry["role"]

                            history_openai_format.append({"role": "user", "content": message})


                            config.set_value("groups", selected_groups)
                            pgpt = PrivateGPTAPI(config)
                            response = pgpt.respond_with_context(history_openai_format)
                            print(response)
                            user_input = ""
                            for message in history_openai_format:
                                user_input += json.dumps(message)

                            tokens = response["answer"].split(" ")
                            partial_message = ""

                            for i, token in enumerate(tokens):
                                partial_message = partial_message + token + " "
                                await asyncio.sleep(0.05)
                                yield partial_message

                            citations = []
                            for source in response["sources"]:
                                document_info = pgpt.get_document_info(source["documentId"])

                                citations.append(document_info["title"] +
                                                 #" Page: " + str(source["page"] + 1) +
                                                 "\n" + str(source["context"]).replace("#", "") + "\n\n")
                            result = [{"role": "assistant",
                                    "content": response["answer"]
                                    }
                                 ]
                            if len(citations) > 0:
                                result.append({
                                    "role": "user",
                                    "content": " "
                                })
                                result.append( {
                                       "role": "assistant",
                                       "content": "\n".join([f"• {cite}" for cite in citations]),
                                       "metadata": {"title": "📚 Citations",
                                                    "status": "done"}
                                   })

                            yield result

                    async def call_tool(mcp_server, tool_name, tool_args) -> json:
                        print("starting to call the tool")

                        tool_response = None
                        try:
                            server_params = await load_config(mcp_config, mcp_server)
                            try:
                                async with stdio_client(server_params) as (read_stream, write_stream):
                                    # Check if our current config has a tool.

                                    init_result = await send_initialize(read_stream, write_stream)
                                    # check we got a result
                                    if not init_result:
                                        print("Server initialization failed")
                                        return

                                    tools = await send_tools_list(read_stream, write_stream)
                                    stuff = json.dumps(tools)
                                    toolsobject = json.loads(stuff)["tools"]
                                    print(toolsobject)

                                    server_has_tool = False
                                    for tool in toolsobject:
                                        if tool["name"] == tool_name:
                                            print(f"Found tool {tool_name}.")
                                            server_has_tool = True
                                    if server_has_tool is False:
                                        print("no tool in server")
                                    else:
                                        print(tool_args)
                                        tool_response = await send_call_tool(
                                            tool_name, tool_args, read_stream, write_stream)
                                        raise BaseException()  # Until we find a better way to leave the async with

                            except:
                                raise BaseException()

                            raise BaseException()
                        except BaseException as e:
                            pass

                        return tool_response

                    def change_group(selected_item):
                        global selected_groups
                        selected_groups = selected_item

                    groupslist = gr.CheckboxGroup(choices=[], label="Groups")
                    groupslist.change(change_group, groupslist, None)

                    chatbot = gr.Chatbot(
                                        height="60vh",
                                        show_label=False,
                                        type="messages",
                                        avatar_images=(
                                              None,
                                              "./clients/Gradio/logos/Logo_dark.svg"
                                          ),
                                         )

                    gr.ChatInterface(predict,
                                     chatbot=chatbot,
                                     type="messages",
                                     textbox=gr.MultimodalTextbox(placeholder="Ask me a question", autofocus=True, container=True, scale=7, sources=["upload", "microphone"]),
                                     examples=["Hello", "Write a Python function that counts all numbers from 1 to 10",
                                               "How is the weather today in Munich?"],
                                     cache_examples=False


                    )
                    with gr.Row():
                        show_btn = gr.Button("Chat Settings")
                        show_btn2 = gr.Button("MCP Tools")
                with gr.Tab("Sources"):


                    def upload_file(file, sources):
                        global pgpt
                        global selected_groups
                        global default_groups
                        UPLOAD_FOLDER = "./data"

                        if len(selected_groups) == 0:
                            gr.Warning("Select at least one group, source was not added")
                            return sources

                        if not os.path.exists(UPLOAD_FOLDER):
                            os.mkdir(UPLOAD_FOLDER)
                        shutil.copy(file, UPLOAD_FOLDER)
                        print()
                        file_path = os.path.join(UPLOAD_FOLDER, file)


                        file_extension = os.path.splitext(file_path)[1]
                        print(f"File Extension: {file_extension}")


                        if file_extension == ".wav":
                            markdown = transcribe_whisper(file_path)

                        elif file_extension == ".jpg" or file_extension == ".jpeg" or file_extension == ".png" or file_extension == ".bmp":
                            markdown = process_image("Analyze this image", file_path)

                        else:
                            content = ""
                            if file_extension == ".pdf":
                                content = LoadersFactory().pdf(file_path)
                            elif file_extension == ".csv":
                                content = LoadersFactory().csv(file_path)
                            elif file_extension == ".xlsx":
                                content = LoadersFactory().xlsx(file_path)
                            elif file_extension == ".md":
                                content = LoadersFactory().markdown(file_path)
                            # todo add more sources

                            markdown = LoadersFactory().convert_documents_to_markdown(content)
                            print(markdown)

                            
                        if os.path.exists(file_path):
                            os.remove(file_path)
                            print("File deleted successfully.")
                        else:
                            print("File does not exist.")


                        gr.Info("Processing, please wait...")


                        if pgpt is not None:
                            print(pgpt.base_url)
                            filepath = Path(file_path)
                            file_name = filepath.name
                            answer =  pgpt.add_source(markdown, selected_groups, file_name)
                            print(str(answer["documentId"]))
                            document_info = pgpt.get_document_info(answer["documentId"])
                            #gr.Info("Added:" + str(document_info))
                            dt = datetime.fromisoformat(document_info["createdAt"])
                            # Format to human-readable string
                            human_readable = dt.strftime("%A, %B %d, %Y  %I:%M %p %Z")

                            if len(sources) < MAX_ITEMS:
                                sources.append({"name": document_info["title"], "creator": document_info["creator"]["name"], "date": human_readable, "status": document_info["state"], "groups": document_info["groups"], "id": document_info["sourceId"]})
                            return sources




                    gr.Markdown("## 📚 PrivateGPT Sources")

                    groupslist2 = gr.CheckboxGroup(choices=[], label="Groups")
                    groupslist2.change(change_group, groupslist2, None)

                    upload_button = gr.UploadButton("➕ Add Source")



                    MAX_ITEMS = 200  # Max number of sources


                    sources_state = gr.State([])  # Start with an empty state

                    rows = []

                    # Create rows for each source
                    for i in range(MAX_ITEMS):
                        with gr.Row(visible=False) as row:  # Initially invisible
                            name = gr.Text(value="", label="Name", interactive=False, show_label=False)  # Read-only field
                            groups = gr.Text(value="", label="Groups", interactive=False,
                                              show_label=False)  # Read-only field
                            creator = gr.Text(value="", label="Creator", interactive=False,  show_label=False)  # Read-only field
                            date = gr.Text(value="", label="Date", interactive=False,  show_label=False)  # Read-only field
                            status = gr.Text(value="", label="Status",  show_label=False)  # Label for status
                            delete_btn = gr.Button("🗑️", scale=0)
                            rows.append((row, name, groups, creator, date, status, delete_btn))

                            # Delete handler
                            delete_btn.click(delete_source, inputs=[sources_state, gr.State(i)],
                                             outputs=[sources_state])

                    # Add source button
                    #upload_button.click(add_source, inputs=[sources_state], outputs=[sources_state])
                    upload_button.upload(upload_file, inputs=[upload_button, sources_state], outputs=sources_state)

                    # Auto re-render UI when sources change
                    sources_state.change(
                        render_ui,
                        inputs=[sources_state],
                        outputs=[comp for row in rows for comp in row]
                    )

                    # Fetch sources from "API" and initialize the UI with them
                    def load_sources():
                        #todo that's ugly.
                        while pgpt is None:
                            time.sleep(2)
                        groups = pgpt.list_personal_groups()
                        print(groups)

                        sources = []
                        for group in groups:
                            group_sources = pgpt.get_sources_from_group(group)
                            for entry in group_sources:
                                sources.append(entry)

                        final = []
                        for source in sources:
                            print(source)
                            dt = datetime.fromisoformat(source["createdAt"])
                            # Format to human-readable string
                            human_readable = dt.strftime("%A, %B %d, %Y  %I:%M %p %Z")
                            final.append({"name": source["title"], "creator": source["creator"]["name"], "date": human_readable, "status": source["state"], "groups": source["groups"], "id": source["sourceId"]})

                        return final

                    #load_data()

                    # Trigger data fetching and rendering on app load

                    main.load(load_sources, outputs=[sources_state])




                with Modal(visible=False) as modalsettings:
                    global temperature
                    global top_p




                    def change_temperature(value):
                        global temperature
                        try:
                            val = float(value)
                            if isinstance(val, float):
                                if 0.0 <= val <= 1.0:
                                    temperature = float(value)
                                    success_message = gr.Success("New Temperature saved")
                        except:
                            error_message = gr.Warning("Not a valid entry")

                    def change_top_p(value):
                        global top_p
                        try:
                            val = float(value)
                            if isinstance(val, float):
                                if 0.0 <= val <= 1.0:
                                    top_p = float(value)
                                    success_message = gr.Success("New top_p value saved")
                        except:
                            error_message = gr.Warning("Not a valid entry")



                    temperature_input = gr.Textbox(label="Temperature", placeholder=str(temperature))
                    temperature_input.change(change_temperature, temperature_input)

                    top_p_input = gr.Textbox(label="Top_p", placeholder=str(top_p))
                    top_p_input.change(change_top_p, top_p_input)

                with Modal(visible=False) as modalmcp:
                    global mcp_servers

                    gr.Markdown("## 🛠️ Available MCP Tools")

                    for mcp_server in mcp_servers:
                        descr = ""
                        lines = 1
                        for tool in mcp_server[1]:
                            descr += "Tool: " + tool["function"]["name"] + "\n" + "Description: " + tool["function"]["description"] + "\n\n"
                            lines+=3


                        gr.Textbox(descr, show_label=True, label=mcp_server[2], lines=lines)





                show_btn.click(lambda: Modal(visible=True), None, modalsettings)
                show_btn2.click(lambda: Modal(visible=True), None, modalmcp)
                # todo add management of sources, users etc later.


            #with gr.Tab("Users"):
                # Initial data source
            #    gr.Markdown("Test function, not working.")
                # TODO Api.


        # Connect button to function and update components accordingly
        login_button.click(
            fn=login,
            inputs=[username_input, password_input, groupslist, groupslist2],
            outputs=[login_interface, dashboard_interface, login_message, groupslist, groupslist2]
        )

    demo.launch(favicon_path="./clients/Gradio/favicon.ico")


asyncio.run(create_interface())