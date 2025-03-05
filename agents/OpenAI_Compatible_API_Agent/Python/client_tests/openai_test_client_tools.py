import argparse
import json
from enum import Enum
from typing import Union

from pydantic import BaseModel

import openai
from openai import OpenAI


class Table(str, Enum):
    orders = "orders"
    customers = "customers"
    products = "products"


class Column(str, Enum):
    id = "id"
    status = "status"
    expected_delivery_date = "expected_delivery_date"
    delivered_at = "delivered_at"
    shipped_at = "shipped_at"
    ordered_at = "ordered_at"
    canceled_at = "canceled_at"


class Operator(str, Enum):
    eq = "="
    gt = ">"
    lt = "<"
    le = "<="
    ge = ">="
    ne = "!="


class OrderBy(str, Enum):
    asc = "asc"
    desc = "desc"


class DynamicValue(BaseModel):
    column_name: str


class Condition(BaseModel):
    column: str
    operator: Operator
    value: Union[str, int, DynamicValue]


class Query(BaseModel):
    table_name: Table
    columns: list[Column]
    conditions: list[Condition]
    order_by: OrderBy

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Provide an API key to connect to OpenAI-compatible API.")
    parser.add_argument("--api_key", required=True, help="API key for login")
    args = parser.parse_args()

    stream = True
    client = OpenAI(
        base_url="http://localhost:8001/",
        api_key=args.api_key
    )
    completion = client.beta.chat.completions.parse(
        model="pgpt",
        messages=[
            {
                "role": "system",
                "content": "You are a helpful assistant. The current date is August 6, 2025. You help users query for the data they are looking for by calling the query function.",
            },
            {
                "role": "user",
                "content": "look up all my orders in may of last year that were fulfilled but not delivered on time",
            },
        ],
        tools=[
            openai.pydantic_function_tool(Query),
        ],
        extra_body={
            "groups": [],
            "newSession": True
        }
    )

    try:
        results = json.loads(completion.choices[0].message.content)
        print(json.dumps(results, indent=2))
    except:
        print(completion.choices[0].message.content)