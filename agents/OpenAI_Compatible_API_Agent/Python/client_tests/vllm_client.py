import argparse

from openai import OpenAI
#pip install python-certifi-win32


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Provide an API key to connect to OpenAI-compatible API.")
    parser.add_argument("--api_key", required=True, help="API key for login")
    parser.add_argument("--base_url", required=True, help="The base url of the VLLM server")
    args = parser.parse_args()

    client = OpenAI(
        base_url=args.base_url,
        api_key=args.api_key,
    )

    stream = False
    response = client.chat.completions.create(
        model="/models/mistral-nemo-12b",
        temperature=0.8,
        top_p=0.8,
        stream=stream,

        # tools=tools or None,
        messages=[
            {"role": "system", "content": "You are a helpful agent."},
            {"role": "user", "content": "Tell me a short interesting story!"}
        ]
    )

    if stream:
        for chunk in response:
            print(chunk.choices[0].delta.content or "")

    else:
        # print the top "choice"
        print(response.choices[0].message.content)