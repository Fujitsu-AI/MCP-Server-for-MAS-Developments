import argparse
from openai import OpenAI
import json

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Provide an API key to connect to OpenAI-compatible API.")
    parser.add_argument("--api_key", required=True, help="API key for login")
    args = parser.parse_args()

    stream = False


    # Initialize OpenAI client that points to the local LM Studio server
    client = OpenAI(
        base_url="http://localhost:8001/",
        api_key=args.api_key
    )

    # Define the conversation with the AI
    messages = [
        {"role": "system", "content": "You are a helpful AI assistant."},
        {"role": "user", "content": "Create 5-10 fictional characters"}
    ]

    # Define the expected response structure
    character_schema = {
        "type": "json_schema",
        "json_schema": {
            "name": "characters",
            "schema": {
                "type": "object",
                "properties": {
                    "characters": {
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
                "required": ["characters"]
            },
        }
    }

    # Get response from AI
    response = client.chat.completions.create(
        model="pgpt",
        messages=messages,
        stream=stream,
        response_format=character_schema,
        extra_body={
            "groups": [],
            "newSession": True
        }
    )

    # Parse and display the results
    #print(response.choices[0].message.content)

    if stream:
        for chunk in response:
            print(chunk.choices[0].delta.content or "")

    else:
        results = json.loads(response.choices[0].message.content)
        print(json.dumps(results, indent=2))