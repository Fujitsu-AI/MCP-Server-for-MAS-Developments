import argparse
import json
import httpx
from openai import OpenAI

character_schema = {'name': 'characters', 'type': 'object',
                    'properties': {"characters": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "occupation": {"type": "string"},
                                "personality": {"type": "string"},
                                "background": {"type": "string"}
                            },
                            "required": ["name", "occupation", "personality", "background"]
                        },
                        "minItems": 1,
                    }
                },
                "required": ["characters"],
                }



print(character_schema)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Provide an API key to connect to OpenAI-compatible API.")
    parser.add_argument("--api_key", required=True, help="API key for login")
    parser.add_argument("--base_url", required=True, help="The base url of the VLLM server")
    args = parser.parse_args()


    client = OpenAI(
        base_url=args.base_url,
        api_key=args.api_key,
        http_client=  httpx.Client(verify=False)
    )

    completion = client.chat.completions.create(
        model="/models/mistral-nemo-12b",
        messages=[
            {
                "role": "user",
                "content": "Generate a JSON with 5-10 fictional characters working at Fujitsu",
            }
        ],
        extra_body={"guided_json": character_schema},
    )
    try:
        results = json.loads(completion.choices[0].message.content)
        print(json.dumps(results, indent=2))
    except:
        print(completion.choices[0].message.content)