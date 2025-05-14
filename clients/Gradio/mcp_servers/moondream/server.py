import gzip
import io
import os
import sys

import requests
from mcp.server import FastMCP

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

mcp = FastMCP("Caption or analyze a given image based on a prompt")
md_model = None

@mcp.tool()
def process_image(prompt:str, file_path:str) -> str:
    """Describe an image based on a prompt.

       Args:
           prompt: Text prompt describing how to analyze the image
           file_path: Filepath to the image to analyze
       """

    import moondream as md
    from PIL import Image
    global md_model

    # todo check if model exists, download on demand. make model selectable.
    if md_model is None:
        # md_model = md.vl(model="./clients/Gradio/models/moondream-0_5b-int8.mf")

        # URL of the zip file
        zip_url = 'https://huggingface.co/vikhyatk/moondream2/resolve/9dddae84d54db4ac56fe37817aeaeb502ed083e2/moondream-2b-int8.mf.gz?download=true'

        # Folder to extract into
        extract_to = './models'

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

        md_model = md.vl(model="./models/moondream-2b-int8.mf")

    # Load and process image
    image = Image.open(file_path)
    encoded_image = md_model.encode_image(image)

    # Generate caption
    # caption = model.caption(encoded_image)["caption"]
    # print("Caption:", caption)

    # Ask questions
    result = md_model.query(encoded_image, prompt)["answer"]
    print("Answer:", result)
    return result

