import argparse
import os
import shutil
from datetime import time
from pathlib import Path

import gradio as gr
from openai import OpenAI

from agents.AgentInterface.Python.config import Config, ConfigError
from clients.Python.Gradio.Api import PrivateGPTAPI

parser = argparse.ArgumentParser(description="Provide an API key to connect to OpenAI-compatible API.")
parser.add_argument("--api_key", required=True, help="API key for login")
parser.add_argument("--base_url", required=True, help="The base url of the VLLM server")
args = parser.parse_args()


# Dummy credentials for demonstration purposes
USERNAME = "user"
PASSWORD = "pass"

# Konfiguration laden
try:
    config_file = Path.absolute(Path(__file__).parent / "config.json")
    config = Config(config_file=config_file, required_fields=["base_url"])
    default_groups = config.get("groups", [])
except ConfigError as e:
    print(f"Configuration Error: {e}")
    exit(1)


user_data_source = ["User1", "User2", "User3", "User4", "User5"]

# Function to handle login logic
def login(username, password):
    config.set_value("email", username)
    config.set_value("password", password)
    pgpt = PrivateGPTAPI(config)
    if pgpt.login():
        # Successful login
        return gr.update(visible=False), gr.update(visible=True), ""
    else:
        return gr.update(), gr.update(visible=False), "Invalid credentials. Please try again."


def show_image(img):
    return img


def create_interface():
    with gr.Blocks(theme="ocean",  css="footer {visibility: hidden}") as demo:
        # Login UI Elements
        login_message = gr.Markdown("")
        with gr.Group() as login_interface:
            gr.Image(value="./logos/Logo_dark.svg", show_label=False,
                     show_download_button=False,
                     show_fullscreen_button=False, height=200)

            username_input = gr.Textbox(label="Username")
            password_input = gr.Textbox(label="Password", type="password")
            login_button = gr.Button("Login")
            local_storage = gr.BrowserState(["", ""])
            saved_message = gr.Markdown("✅ Saved to local storage", visible=False)

        # Dashboard UI Elements
        with gr.Group(visible=False) as dashboard_interface:
            with gr.Blocks(theme="ocean",  css="footer {visibility: hidden}"):
                with gr.Tab("Chat"):
                    def predict(message, history):
                        history_openai_format = []
                        for human, assistant in history:
                            history_openai_format.append({"role": "user", "content": human})
                            history_openai_format.append({"role": "assistant", "content": assistant})
                        history_openai_format.append({"role": "user", "content": message})

                        client = OpenAI(
                            base_url=args.base_url,
                            api_key=args.api_key,
                        )

                        completion = client.chat.completions.create(
                            model="/models/mistral-nemo-12b",
                            messages=history_openai_format,
                            temperature=1.0,
                            stream=True
                        )

                        partial_message = ""
                        for chunk in completion:
                            if len(chunk.choices[0].delta.content) != 0:
                                partial_message = partial_message + chunk.choices[0].delta.content
                                yield partial_message

                    gr.ChatInterface(predict,
                                     chatbot=gr.Chatbot(height=500, show_label=False),
                                     textbox=gr.Textbox(placeholder="Ask me a question", container=False, scale=7),
                                     theme="ocean",
                                     examples=["Hello", "Write a Python function that counts all numbers from 1 to 10",
                                               "Are tomatoes vegetables?"],
                                     cache_examples=False)
                with gr.Tab("Sources"):
                    gr.Markdown("Test function, not working.")

                    def upload_file(file):
                        UPLOAD_FOLDER = "./data"
                        if not os.path.exists(UPLOAD_FOLDER):
                            os.mkdir(UPLOAD_FOLDER)
                        shutil.copy(file, UPLOAD_FOLDER)
                        gr.Info("File Uploaded!!!")

                    upload_button = gr.UploadButton("Click to Upload a File")
                    upload_button.upload(upload_file, upload_button)

                with gr.Tab("Users"):
                    # Initial data source
                    gr.Markdown("Test function, not working.")
                    # TODO Api.. how do we get users?

                    # Function to remove selected option from the dropdown
                    def remove_option(selected_option, options):
                        if selected_option in options:
                            options.remove(selected_option)
                        return options, gr.update(choices=options, value=None)  # Reset selection

                    # Function to update the options by removing the selected ones
                    def update_options(selected_options):
                        global user_data_source
                        # Filter out selected options
                        user_data_source = [option for option in user_data_source if option not in selected_options]
                        # TODO delete others from db
                        for element in selected_options:
                            print("todo: delete from db")
                        selected_options = []

                        return gr.update(choices=user_data_source, value=None)  # Return the updated choices

                    # Gradio Interface: Create blocks to lay out components
                    with gr.Blocks() as demo2:
                        global user_data_source

                        # Define a CheckboxGroup which we may need to dynamically update
                        checkbox = gr.CheckboxGroup(choices=user_data_source, label="Options")
                        remove_button = gr.Button("Remove User")

                        # Connect button click to update function, modifying the choices in CheckboxGroup
                        remove_button.click(fn=update_options, inputs=checkbox, outputs=checkbox)





        # Connect button to function and update components accordingly
        login_button.click(
            fn=login,
            inputs=[username_input, password_input],
            outputs=[login_interface, dashboard_interface, login_message]
        )

        @demo.load(inputs=[local_storage], outputs=[username_input, password_input])
        def load_from_local_storage(saved_values):
            print("loading from local storage", saved_values)
            return saved_values[0], saved_values[1]

        @gr.on([username_input.change, password_input.change], inputs=[username_input, password_input], outputs=local_storage)
        def save_to_local_storage(username, password):
            return [username, password]

        @gr.on(local_storage.change, outputs=saved_message)
        def show_saved_message():
            return gr.Markdown(
                f"✅ Saved to local storage",
                visible=True
            )

    demo.launch()


create_interface()