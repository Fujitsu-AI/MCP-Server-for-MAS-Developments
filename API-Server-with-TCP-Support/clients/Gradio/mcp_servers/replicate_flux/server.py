import os

import PIL
import requests
from mcp.server.fastmcp import FastMCP, Image
import json
import sys
import io
from PIL import Image as PilImage
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

mcp = FastMCP("Generate images with Flux")


@mcp.tool()
async def generate_image(prompt: str, ratio: str = "1:1") ->  str:
    """Generate an image using Flux model.

    Args:
        prompt: Text prompt describing the image to generate
        ratio: Image ratio (default: 1:1)
    """
    try:
        import replicate

        output = replicate.run(
            "black-forest-labs/flux-1.1-pro",
            input={"prompt": prompt,
                   "aspect_ratio": ratio,
                   "output_format": "jpg",
                   "output_quality": 80,
                   "safety_tolerance": 2,
                   "prompt_upsampling": True
                   }
        )
        #print(output)
        return json.dumps({
            "type": "image",
            "url": str(output),
            "message": f"Generated image: {str(prompt)}"
        })

        #response = requests.get(output, verify=False)
        #img = PilImage.open(io.BytesIO(response.content))
        #img.save("image.jpg")
        #return Image(data=img.tobytes(), format='jpeg')


    except Exception as e:
        print("Error: " + str(e))
        return json.dumps({
            "type": "error",
            "message": f"Error generating image: {str(e)}"
        })


if __name__ == "__main__":

    import asyncio
    img = asyncio.run(generate_image("A yellow bird"))
    j = json.loads(img)
    print("getting image:" + j.get("url"))

    response = requests.get(j.get("url"), verify=False)
    print("opening image")
    image = PilImage.open(io.BytesIO(response.content)).convert("RGB")
    image.save("image.jpg")
