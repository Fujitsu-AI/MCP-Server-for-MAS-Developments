import argparse
from typing import Optional

from langchain_community.chat_models import ChatOpenAI
from openai import OpenAI
from pydantic import Field, BaseModel

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Provide an API key to connect to OpenAI-compatible API.")
    parser.add_argument("--api_key", required=True, help="API key for login")
    args = parser.parse_args()

    # init client and connect to localhost server
    client = OpenAI(
        api_key=args.api_key,
        base_url="http://127.0.0.1:8001"  # change the default port if needed
    )

    stream = False
    try:
        chat_completion = client.chat.completions.create(
            model="pgpt",
            messages=[{"role": "system", "content": "Be funny."}, {"role": "user", "content": "Say this is a test"}],
            stream=stream,
            extra_body={
                "groups": [],
                "newSession": True
            }
        )
        if stream:
            for chunk in chat_completion:
                print(chunk.choices[0].delta.content or "")

        else:
            # print the top "choice"
            print(chat_completion.choices[0].message.content)

    except Exception as e:
        print(e)

