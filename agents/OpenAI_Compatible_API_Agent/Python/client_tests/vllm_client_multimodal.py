import argparse
import base64
import io

import httpx
from PIL import Image
from openai import OpenAI

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Provide an API key to connect to OpenAI-compatible API.")
    parser.add_argument("--api_key", required=True, help="API key for login")
    parser.add_argument("--base_url", required=True, help="The base url of the VLLM server")
    args = parser.parse_args()

    client = OpenAI(
        base_url=args.base_url,
        api_key=args.api_key,
        http_client=httpx.Client(verify=False)
    )

    from openai import OpenAI

    # for local file:
    image = Image.open("Python/client_tests/japan.jpg")
    # Convert the image to a byte stream
    buffered = io.BytesIO()
    image.save(buffered, format="JPEG")  # Specify the format (e.g., JPEG, PNG)
    image_bytes = buffered.getvalue()
    image_base64 = base64.b64encode(image_bytes).decode("utf-8")
    # local file end

    chat_response = client.chat.completions.create(
        model="mistralai/Mistral-Small-3.1-24B-Instruct-2503",
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": "What's in this image?"},
                {
                    "type": "image_url",
                    "image_url": {

                        "url": f"data:image/jpeg;base64,{image_base64}"
                        #or simply:
                        #"url": "https://www.urlaubstracker.de/wp-content/uploads/2019/03/japan-fuji-himeji-castle.jpg",

                    },
                },
            ],
        }],
    )
    print("Chat response:", chat_response.choices[0].message.content)